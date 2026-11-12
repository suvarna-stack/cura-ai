"""The new /suggest pipeline: chart terms -> codebook -> past cases -> order.

A tiny codebook and case memory are swapped in, the PDF retrieval is
stubbed, and the LLM is a fake, so each test is about one behaviour.
"""
import pytest

from app.config import get_settings
from app.core import case_memory, codebook as cb, learn, suggest

CHART = (
    "Chief Complaint: ไข้สูง ไอมีเสมหะ 4 วัน\n"
    "Assessment: Community acquired pneumonia; Type 2 DM\n"
    "Plan: CXR, oral antibiotic, F/U 3 days"
)

ENTRIES = [
    cb.Entry("J18.9", cb.ICD10, "Pneumonia, unspecified", "ปอดบวม"),
    cb.Entry("J15.9", cb.ICD10, "Bacterial pneumonia"),
    cb.Entry("E11.9", cb.ICD10, "DM Type 2 (Diabetes mellitus Type 2)"),
    cb.Entry("J02.9", cb.ICD10, "Acute pharyngitis", "คอหอยอักเสบเฉียบพลัน"),
    cb.Entry("U78.824", cb.ICD10, "Allergic rhinitis"),            # Thai traditional medicine
    cb.Entry("J30.4", cb.ICD10, "Allergic rhinitis, unspecified"),
    cb.Entry("87.44", cb.ICD9, "Routine chest x-ray", terms=["X-ray of chest NOS"]),
    cb.Entry("89.52", cb.ICD9, "Electrocardiogram"),
]


@pytest.fixture
def pipeline(monkeypatch):
    cb.set_index(cb.CodebookIndex(ENTRIES))
    case_memory.set_memory(case_memory.CaseMemory([]))
    calls = []
    monkeypatch.setattr(suggest, "retrieve_chunks",
                        lambda *a, **k: calls.append(k) or ("plain", []))
    monkeypatch.setattr(learn, "match_notes", lambda text, limit=3: [])
    monkeypatch.setattr(learn, "bump_hits", lambda ids: None)
    yield calls
    cb.set_index(None)
    case_memory.set_memory(None)


def codes(out, system=None):
    return [c["code"] for c in out["codes"] if system in (None, c["system"])]


def test_principal_diagnosis_comes_first_and_every_diagnosis_is_offered(pipeline):
    out = suggest.suggest_codes(CHART)
    icd10 = codes(out, "ICD-10")
    assert icd10[0] == "J18.9"
    assert "E11.9" in icd10[:3]
    assert out["mode"] == "codebook"


def test_procedure_from_the_plan_and_no_drug_orders(pipeline):
    assert codes(suggest.suggest_codes(CHART), "ICD-9") == ["87.44"]


def test_each_suggestion_quotes_the_chart(pipeline):
    top = suggest.suggest_codes(CHART)["codes"][0]
    assert "Community acquired pneumonia" in top["source"]
    assert top["source"].startswith("codebook")


def test_old_pdf_search_is_skipped_when_the_chart_answers_both_columns(pipeline):
    suggest.suggest_codes(CHART)
    assert pipeline == []


def test_old_pdf_search_still_fills_a_column_the_chart_left_empty(pipeline):
    suggest.suggest_codes("Assessment: Community acquired pneumonia\nPlan: rest")
    assert {k.get("code_system") for k in pipeline} == {"icd9cm"}


def test_thai_traditional_medicine_codes_only_for_ttm_charts(pipeline):
    plain = codes(suggest.suggest_codes("Assessment: Allergic rhinitis, seasonal"))
    assert "U78.824" not in plain and "J30.4" in plain
    ttm = codes(suggest.suggest_codes("Assessment: Allergic rhinitis\nแพทย์แผนไทย นวด"))
    assert "U78.824" in ttm


def test_an_excluded_code_still_never_appears(pipeline, monkeypatch):
    note = {"id": "n1", "scenario": "", "rule": "", "created_by": "Frank",
            "created_at": "", "match": 0.9,
            "codes": [{"code": "E11.9", "system": "ICD-10", "role": "exclude"}]}
    monkeypatch.setattr(learn, "match_notes", lambda text, limit=3: [note])
    assert "E11.9" not in codes(suggest.suggest_codes(CHART))


def test_a_similar_approved_case_confirms_and_adds_codes(pipeline):
    case_memory.set_memory(case_memory.CaseMemory([{
        "id": "past-1",
        "sections": {"Chief Complaint": "ไข้สูง ไอมีเสมหะ 5 วัน",
                     "Assessment": "Pneumonia"},
        "icd10": ["J18.9"], "icd9": ["89.52"],
    }]))
    out = suggest.suggest_codes(CHART)
    top = out["codes"][0]
    assert top["code"] == "J18.9" and "approved case past-1" in top["source"]
    ekg = next(c for c in out["codes"] if c["code"] == "89.52")
    assert "approved case past-1" in ekg["source"]


def test_complaint_only_chart_still_gets_thai_matches(pipeline):
    out = suggest.suggest_codes("Chief Complaint: คอหอยอักเสบเฉียบพลัน เจ็บคอ 2 วัน")
    assert codes(out, "ICD-10")[0] == "J02.9"


class FakeLLM:
    def __init__(self, answer):
        self.answer = answer

    def generate(self, messages, max_new_tokens=None, temperature=None):
        return self.answer


def test_llm_rerank_can_reorder_but_never_add(pipeline):
    found = {}
    suggest._offer(found, "J18.9", "Pneumonia", 90, "codebook", "ICD-10", tier=1, order=0)
    suggest._offer(found, "E11.9", "DM", 80, "codebook", "ICD-10", tier=1, order=1)
    llm = FakeLLM('{"icd10": ["E11.9", "Z99.9", "J18.9"], "icd9": []}')
    assert suggest._llm_rerank("chart", found, llm=llm)
    assert "Z99.9" not in found
    assert found["E11.9"]["order"] < found["J18.9"]["order"]


def test_llm_switch(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "llm_backend", "transformers")
    assert suggest._llm_on("auto") is False
    monkeypatch.setattr(s, "llm_backend", "ollama")
    assert suggest._llm_on("auto") is True
    assert suggest._llm_on("off") is False


def test_rag_engine_setting_restores_the_old_behaviour(pipeline, monkeypatch):
    monkeypatch.setattr(get_settings(), "suggest_engine", "rag")
    suggest.suggest_codes(CHART)
    assert {k.get("code_system") for k in pipeline} == {"icd10", "icd9cm"}
