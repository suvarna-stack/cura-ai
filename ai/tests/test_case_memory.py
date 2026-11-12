"""Step 3: approved cases as candidates, examples and test set."""
from app.core import case_memory, codebook as cb

CASES = [
    {"id": "a", "sections": {"Chief Complaint": "เจ็บคอ กลืนลำบาก 2 วัน",
                             "Assessment": "Acute pharyngitis"},
     "icd10": ["J02.9"], "icd9": []},
    {"id": "b", "sections": {"Chief Complaint": "ปวดหลังส่วนล่าง 2 สัปดาห์",
                             "Assessment": "Low back pain"},
     "icd10": ["M54.5"], "icd9": ["93.35"]},
    {"id": "no-codes", "text": "Assessment: nothing coded"},
]


def test_cases_without_codes_are_not_kept():
    assert len(case_memory.CaseMemory(CASES)) == 2


def test_most_similar_case_first_and_leave_one_out():
    mem = case_memory.CaseMemory(CASES)
    hits = mem.similar("Chief Complaint: เจ็บคอมาก กลืนลำบาก", min_score=0.1)
    assert hits[0].case["id"] == "a"
    assert all(h.case["id"] != "a" for h in
               mem.similar("Chief Complaint: เจ็บคอ กลืนลำบาก 2 วัน", min_score=0.0,
                           exclude_id="a"))


def test_example_for_the_model_uses_code_titles_not_codes():
    idx = cb.CodebookIndex([cb.Entry("J02.9", cb.ICD10, "Acute pharyngitis")])
    sim = case_memory.CaseMemory(CASES).similar("เจ็บคอ กลืนลำบาก", min_score=0.0)[0]
    ex = case_memory.as_example(sim, idx)
    assert ex["answer"]["diagnoses"][0]["term"] == "Acute pharyngitis"
    assert "Chief Complaint:" in ex["text"]


def test_load_skips_bad_lines(tmp_path):
    p = tmp_path / "cases.jsonl"
    p.write_text('{"id": "x", "text": "t", "icd10": ["J00"]}\nnot json\n\n', encoding="utf-8")
    assert [c["id"] for c in case_memory.load_cases(p)] == ["x"]
