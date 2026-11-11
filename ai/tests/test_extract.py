"""Step 2: read the chart for what should be coded."""
from app.core import extract

CHART = (
    "Chief Complaint: ไข้สูง ไอมีเสมหะเขียว เหนื่อย 4 วัน\n"
    "Present Illness: 4 วันก่อนมา ไข้สูงหนาวสั่น\n"
    "Physical Examination: crepitation at right lower lung\n"
    "Assessment: Community acquired pneumonia, right lower lobe; Type 2 DM\n"
    "Headache, rule out intracranial lesion\n"
    "Plan: CXR, oral antibiotic, F/U 3 days"
)


def test_diagnoses_come_from_the_assessment_in_chart_order():
    ex = extract.rules_extract(CHART)
    ev = [t.evidence for t in ex.diagnoses]
    assert ev[0] == "Community acquired pneumonia, right lower lobe"  # site kept with it
    assert "Type 2 DM" in ev
    assert ex.diagnoses[0].rank == 0


def test_rule_out_is_not_a_diagnosis():
    ev = [t.evidence for t in extract.rules_extract(CHART).diagnoses]
    assert not any("intracranial" in e for e in ev)


def test_abbreviations_are_expanded_for_search():
    dm = next(t for t in extract.rules_extract(CHART).diagnoses if t.evidence == "Type 2 DM")
    assert "diabetes mellitus" in dm.text
    assert extract.expand("age 45") == "age 45"          # a word, not shorthand


def test_procedures_skip_drugs_and_follow_up():
    procs = [t.evidence for t in extract.rules_extract(CHART).procedures]
    assert procs == ["CXR"]


def test_without_a_diagnosis_the_complaint_is_used_at_lower_weight():
    ex = extract.rules_extract("Chief Complaint: เจ็บคอมาก กลืนลำบาก 2 วัน")
    assert not ex.diagnoses
    assert ex.symptoms and ex.symptoms[0].weight < 1.0


def test_inline_plan_inside_the_assessment_field_is_split_off():
    sec = extract.split_sections("Assessment: Acute bronchitis\\r\\nPlan: nebulization at OPD")
    assert sec["diagnosis"] == "Acute bronchitis"
    assert "nebulization" in sec["plan"]


class FakeLLM:
    def __init__(self, answer):
        self.answer = answer
        self.messages = None

    def generate(self, messages, max_new_tokens=None, temperature=None):
        self.messages = messages
        return self.answer


def test_llm_terms_are_parsed_and_codes_it_writes_are_ignored():
    llm = FakeLLM('Sure!\n```json\n{"diagnoses": [{"term": "Acute tonsillitis", '
                  '"evidence": "ทอนซิลโต"}, {"term": "J03.9"}], "procedures": []}\n```')
    ex = extract.llm_extract("Chief Complaint: เจ็บคอ", llm=llm)
    assert [t.evidence for t in ex.diagnoses] == ["ทอนซิลโต"]
    assert ex.diagnoses[0].origin == "llm"


def test_llm_failure_means_rules_only():
    class Broken:
        def generate(self, *a, **k):
            raise RuntimeError("ollama down")
    assert extract.llm_extract("x", llm=Broken()) is None
    assert extract.llm_extract("x", llm=FakeLLM("no json here")) is None


def test_worked_examples_go_before_the_chart():
    llm = FakeLLM('{"diagnoses": [], "procedures": []}')
    extract.llm_extract("NEW CHART", examples=[{"text": "OLD", "answer": {"diagnoses": []}}],
                        llm=llm)
    assert [m["role"] for m in llm.messages] == ["system", "user", "assistant", "user"]
    assert llm.messages[-1]["content"] == "NEW CHART"


def test_merge_adds_only_new_llm_terms_and_drops_symptom_fallback():
    rules = extract.rules_extract("Chief Complaint: เจ็บคอ")
    llm = extract.Extraction(diagnoses=[extract.Term("Acute pharyngitis", "diagnosis",
                                                     "เจ็บคอ", 0.95, 0, "llm")])
    out = extract.merge(rules, llm)
    assert [t.text for t in out.diagnoses] == ["Acute pharyngitis"]
    assert out.symptoms == []
