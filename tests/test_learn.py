"""Suggest & Learn: extraction, classification, storage and matching.

No embeddings and no LLM here — the vector store is stubbed and extraction is
forced down its deterministic path, which is exactly the path that has to work
when the model is missing or too small to produce JSON.
"""
import json
from types import SimpleNamespace

import pytest

from app.core import learn, registry


@pytest.fixture
def store(monkeypatch, tmp_path):
    """Isolated note file + registry/uploads + a fake vector store that
    records what was indexed."""
    calls = {"added": [], "deleted": []}

    class FakeStore:
        def add(self, chunks, source, metadata=None, ids=None, per_chunk_meta=None):
            calls["added"].append({"source": source, "text": chunks[0],
                                   "metadata": metadata})
            return len(chunks)

        def delete_by_source(self, source):
            calls["deleted"].append(source)
            return 1

        def find_text(self, needle, limit=2):
            return []

    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    settings = SimpleNamespace(data_dir=tmp_path, upload_dir=upload_dir,
                               registry_path=tmp_path / "documents.json")
    monkeypatch.setattr(learn, "get_settings", lambda: settings)
    monkeypatch.setattr(registry, "get_settings", lambda: settings)
    monkeypatch.setattr(learn, "get_store", lambda: FakeStore())
    monkeypatch.setattr(learn, "_path", lambda: tmp_path / "learned_notes.json")
    monkeypatch.setattr(learn, "_llm_extract", lambda text: None)
    calls["upload_dir"] = upload_dir
    return calls


# --------------------------- classification ---------------------------

@pytest.mark.parametrize("text", [
    "Always code E11.22 as principal for diabetic AKI",
    "For post-op wound infection do not code R50.9, use T81.4 instead",
    # instruction verb aimed at a code — no global cue word at all
    "Post-op fever with wound infection after appendectomy: use T81.4, not R50.9.",
    # declarative fact: "the code for X is Y"
    "icd 10 code for game addiction is F63.8",
    "ผู้ป่วยเบาหวานที่มี AKI ให้ลง E11.22 เป็นหลัก ตามด้วย N17.9",
])
def test_teaching_is_detected(text):
    assert learn.classify_intent(text)["intent"] == "teach"


@pytest.mark.parametrize("text", [
    "What does code A09 cover?",
    "Which ICD-10 code applies to chest pain?",
    "Can I use T81.4 for post-op fever?",
    "What is I33?",
    "What is the icd 10 code for cholera?",
    "Patient has chest pain and ST elevation on ECG. What ICD codes apply?",
    "Diabetic patient with acute kidney injury. Suggest primary and comorbidity codes.",
    "Post-op fever after appendectomy. Chief complaint: abdominal pain.",
    "รหัส A09 ครอบคลุมอะไรบ้าง?",
])
def test_questions_are_not_teaching(text):
    assert learn.classify_intent(text)["intent"] == "ask"


# --------------------------- extraction ---------------------------

def test_extracts_codes_roles_and_scenario(store):
    note = learn.extract_note(
        "Diabetic patient with acute kidney injury: code E11.22 as principal, "
        "add N17.9, do not code N18.9.",
        created_by="Frank",
    )
    by_code = {c["code"]: c for c in note["codes"]}
    assert by_code["E11.22"]["role"] == "principal"
    assert by_code["N17.9"]["role"] == "secondary"
    assert by_code["N18.9"]["role"] == "exclude"
    assert by_code["E11.22"]["system"] == "ICD-10"
    assert "diabetic" in note["scenario"].lower()
    assert note["extraction"] == "rules"
    assert note["doc_type"] == "icd10"


def test_thai_rule_extracts_and_marks_language(store):
    note = learn.extract_note(
        "ผู้ป่วยเบาหวานที่มีไตวายเฉียบพลัน ให้ลง E11.22 เป็นหลัก ตามด้วย N17.9 "
        "ไม่ต้องลง N18.9",
        created_by="Frank",
    )
    codes = {c["code"]: c["role"] for c in note["codes"]}
    assert codes["E11.22"] == "principal"
    assert codes["N18.9"] == "exclude"
    assert note["language"] == "th"


@pytest.mark.parametrize("text,expected", [
    ("Diabetic patient with acute kidney injury: code E11.22 as principal.",
     "diabetic patient with acute kidney injury"),
    ("For an open appendectomy always code procedure 47.09.",
     "for an open appendectomy"),
    ("ผู้ป่วยเบาหวานที่มีไตวายเฉียบพลัน ให้ลง E11.22 เป็นหลัก",
     "ผู้ป่วยเบาหวานที่มีไตวายเฉียบพลัน"),
])
def test_scenario_stops_before_the_instruction(store, text, expected):
    """WHEN describes the patient; what to do belongs in RULE."""
    assert learn.extract_note(text)["scenario"].lower() == expected


def test_declarative_fact_extracts_scenario_and_principal(store):
    """"the code for X is Y" — Y is THE code, X is the scenario."""
    draft = learn.extract_note("icd 10 code for game addiction is F63.8")
    assert draft["scenario"] == "game addiction"
    assert [(c["code"], c["role"]) for c in draft["codes"]] == [
        ("F63.8", "principal")]


def test_use_x_not_y_phrasing(store):
    """The bare "not" cue must bind to the code right after it, nothing else."""
    note = learn.extract_note(
        "Post-op fever after appendectomy with wound infection: use T81.4, "
        "not R50.9.")
    roles = {c["code"]: c["role"] for c in note["codes"]}
    assert roles["R50.9"] == "exclude"
    assert roles["T81.4"] == "secondary"


def test_icd9_procedure_rule_tags_the_right_box(store):
    note = learn.extract_note(
        "For an open appendectomy always code procedure 47.09.",
        created_by="Frank",
    )
    assert note["codes"][0]["system"] == "ICD-9"
    assert note["doc_type"] == "icd9cm"


def test_explicit_icd9_mention_outranks_the_shape_guess(store):
    """"icd 9 ... is T67": the coder said ICD-9, so T67 is ICD-9 — the
    first-character guess must not override an explicit system mention."""
    note = learn.extract_note("icd 9 for tik toker is T67")
    assert [(c["code"], c["system"]) for c in note["codes"]] == [
        ("T67", "ICD-9")]
    assert note["doc_type"] == "icd9cm"


@pytest.mark.parametrize("text,code", [
    ("icd9 for health checkup is V70", "V70"),        # V-code, letter-start
    ("icd9 for accidental fall is E888", "E888"),     # external cause, E+3
    ("icd9 for pneumonia is 486", "486"),             # bare category
])
def test_icd9_only_shapes_are_taught_as_icd9(store, text, code):
    note = learn.extract_note(text)
    assert [(c["code"], c["system"]) for c in note["codes"]] == [
        (code, "ICD-9")]
    assert note["doc_type"] == "icd9cm"


def test_bare_numerals_are_not_codes_without_an_icd9_mention(store):
    """"486 patients" is a count; only an explicit ICD-9 sentence turns a
    bare three-digit numeral into a code."""
    note = learn.extract_note("the ward had 486 patients")
    assert note["codes"] == []


def test_hallucinated_codes_are_dropped(monkeypatch, store):
    """The model may invent codes; only what the coder typed survives."""
    monkeypatch.setattr(learn, "_llm_extract", lambda text: {
        "scenario": "diabetic patient with AKI",
        "rule": "code E11.22 first",
        "codes": [{"code": "E11.22", "role": "principal"},
                  {"code": "Z99.9", "role": "secondary"}],   # never typed
    })
    note = learn.extract_note("Diabetic AKI: code E11.22 as principal.")
    assert [c["code"] for c in note["codes"]] == ["E11.22"]
    assert note["extraction"] == "llm"
    assert note["scenario"] == "diabetic patient with AKI"


def test_prompt_echo_is_rejected(monkeypatch, store):
    """A 0.5B model returns the schema's own example text — never keep it."""
    monkeypatch.setattr(learn, "_llm_extract", lambda text: {
        "scenario": "when this rule applies, short",
        "rule": "what to do, one sentence",
        "codes": [{"code": "E11.22", "role": "principal"}],
    })
    note = learn.extract_note(
        "Diabetic patient with acute kidney injury: code E11.22 as principal.")
    assert "when this rule applies" not in note["scenario"]
    assert "diabetic" in note["scenario"].lower()
    assert note["rule"].startswith("code E11.22 as principal")


def test_invented_reason_is_dropped(monkeypatch, store):
    monkeypatch.setattr(learn, "_llm_extract", lambda text: {
        "reason": "Because the WHO guideline of 1998 requires it.",
        "codes": [{"code": "E11.22", "role": "principal"}],
    })
    note = learn.extract_note("Diabetic AKI: code E11.22 as principal.")
    assert note["reason"] == ""


def test_coder_stated_reason_is_kept(store):
    note = learn.extract_note(
        "Diabetic AKI: code E11.22 as principal because the AKI is a "
        "manifestation of the diabetes.")
    assert note["reason"].lower().startswith("because")


def test_indexing_failure_does_not_lose_the_rule(monkeypatch, store):
    """Chroma being down costs semantic recall, never the taught rule."""
    def boom():
        raise RuntimeError("chroma unavailable")

    monkeypatch.setattr(learn, "get_store", boom)
    note = learn.save_note(learn.extract_note(
        "Diabetic patient with acute kidney injury: code E11.22 as principal."))
    assert learn.get_note(note["id"]) is not None
    # still matches — matching reads the note file, not the vector store
    assert len(learn.match_notes("diabetic with acute kidney injury")) == 1


# --------------------------- storage + indexing ---------------------------

def test_save_indexes_the_note_and_survives_reload(store, tmp_path):
    draft = learn.extract_note(
        "Diabetic patient with acute kidney injury: code E11.22 as principal, "
        "add N17.9, do not code N18.9.")
    note = learn.save_note(draft, created_by="Frank")

    assert note["id"].startswith("ln_")
    assert note["created_by"] == "Frank"
    indexed = store["added"][-1]
    assert indexed["source"] == learn.LEARNED_PREFIX + note["id"]
    assert indexed["metadata"]["kind"] == learn.LEARNED_KIND
    assert "CODER RULE" in indexed["text"] and "DO NOT code" in indexed["text"]

    stored = json.loads((tmp_path / "learned_notes.json").read_text(encoding="utf-8"))
    assert list(stored) == [note["id"]]


def test_resaving_replaces_instead_of_duplicating(store):
    note = learn.save_note(learn.extract_note("Code E11.22 as principal for AKI."),
                           created_by="Frank")
    edited = {**note, "rule": "code E11.22 first, then N17.9"}
    again = learn.save_note(edited, created_by="Frank")

    assert again["id"] == note["id"]
    assert len(learn.all_notes()) == 1
    # the old chunk is deleted before the new one is added
    assert store["deleted"].count(learn.LEARNED_PREFIX + note["id"]) == 2


def test_muting_removes_it_from_the_index(store):
    note = learn.save_note(learn.extract_note("Code E11.22 as principal for AKI."))
    added_before = len(store["added"])

    learn.set_active(note["id"], False)
    assert len(store["added"]) == added_before          # nothing re-indexed
    assert learn.all_notes(include_inactive=False) == []
    assert len(learn.all_notes()) == 1                  # still reviewable


def test_delete_removes_note_and_chunk(store):
    note = learn.save_note(learn.extract_note("Code E11.22 as principal for AKI."))
    assert learn.delete_note(note["id"]) is True
    assert learn.all_notes() == []
    assert learn.delete_note(note["id"]) is False


# --------------------------- authorship ---------------------------
# This module enforces nothing — it has no idea who is calling. It records who
# taught a rule so medcode-api, which holds the token, can refuse an edit or a
# delete from anyone but the author.

def test_a_rule_records_the_author_id_that_taught_it(store):
    note = learn.save_note(learn.extract_note("Code E11.22 as principal for AKI."),
                           created_by="Frank", created_by_id=7)
    assert note["created_by_id"] == 7
    assert learn.get_note(note["id"])["created_by_id"] == 7


def test_editing_never_transfers_ownership(store):
    note = learn.save_note(learn.extract_note("Code E11.22 as principal for AKI."),
                           created_by="Frank", created_by_id=7)
    # An admin fixing someone else's rule leaves the credit where it was.
    edited = learn.save_note({**note, "rule": "code E11.22 first"},
                             created_by="Ann", created_by_id=9)
    assert edited["created_by_id"] == 7
    assert edited["created_by"] == "Frank"


def test_a_rule_taught_before_author_ids_keeps_none(store):
    note = learn.save_note(learn.extract_note("Code E11.22 as principal for AKI."),
                           created_by="Frank")
    assert note["created_by_id"] is None


# --------------------------- matching ---------------------------

def test_matching_narrative_finds_the_rule(store):
    learn.save_note(learn.extract_note(
        "Diabetic patient with acute kidney injury: code E11.22 as principal, "
        "add N17.9, do not code N18.9."), created_by="Frank")

    hits = learn.match_notes(
        "65 year old diabetic admitted with acute kidney injury and dehydration")
    assert len(hits) == 1
    assert hits[0]["match"] >= learn._MATCH_THRESHOLD


def test_unrelated_narrative_matches_nothing(store):
    learn.save_note(learn.extract_note(
        "Diabetic patient with acute kidney injury: code E11.22 as principal."))
    assert learn.match_notes("Closed fracture of the left tibia after a fall") == []


def test_shared_code_alone_is_enough_to_match(store):
    learn.save_note(learn.extract_note(
        "Do not code N18.9 together with N17.9."))
    hits = learn.match_notes("Case already carries N17.9 on the chart")
    assert len(hits) == 1
    assert hits[0]["match"] >= 0.55


def test_matching_chunks_are_pinned_at_full_score(store):
    learn.save_note(learn.extract_note(
        "Diabetic patient with acute kidney injury: code E11.22 as principal."),
        created_by="Frank")
    chunks = learn.matching_chunks("diabetic with acute kidney injury")
    assert len(chunks) == 1
    chunk = chunks[0]
    assert chunk["score"] == 1.0
    assert chunk["via"].startswith("learned note")
    assert chunk["display_name"] == "Coder note — Frank"
    assert chunk["metadata"]["kind"] == learn.LEARNED_KIND


def test_muted_notes_never_match(store):
    note = learn.save_note(learn.extract_note(
        "Diabetic patient with acute kidney injury: code E11.22 as principal."))
    learn.set_active(note["id"], False)
    assert learn.match_notes("diabetic with acute kidney injury") == []


def test_hits_are_counted_when_a_rule_fires(store):
    note = learn.save_note(learn.extract_note(
        "Diabetic patient with acute kidney injury: code E11.22 as principal."))
    learn.bump_hits([note["id"]])
    learn.bump_hits([note["id"]])
    assert learn.get_note(note["id"])["hits"] == 2


# --------------------------- admin-page CSV export ---------------------------

def _csv_lines(store, filename):
    path = store["upload_dir"] / filename
    return path.read_text(encoding="utf-8-sig").splitlines() if path.exists() else None


def test_saved_rule_lands_in_the_icd10_box_as_csv(store):
    learn.save_note(learn.extract_note(
        "Diabetic patient with acute kidney injury: code E11.22 as principal, "
        "add N17.9, do not code N18.9."), created_by="Frank")

    lines = _csv_lines(store, "Learned rules ICD-10.csv")
    assert lines[0].startswith("code,description,role")
    assert len(lines) == 4                               # header + 3 codes
    assert lines[1].startswith("E11.22,") and ",principal," in lines[1]
    assert ",Frank," in lines[1]

    entry = registry.get("Learned rules ICD-10")
    assert entry["doc_type"] == "icd10"
    assert entry["status"] == "indexed" and entry["chunks"] == 3
    # nothing taught for ICD-9 -> no ICD-9 file, no registry entry
    assert _csv_lines(store, "Learned rules ICD-9.csv") is None
    assert registry.get("Learned rules ICD-9") is None


def test_icd9_rule_lands_in_the_icd9_box(store):
    learn.save_note(learn.extract_note(
        "Always code 45.13 for diagnostic small-bowel endoscopy."))
    assert registry.get("Learned rules ICD-9")["doc_type"] == "icd9cm"
    assert _csv_lines(store, "Learned rules ICD-9.csv")[1].startswith("45.13,")


def test_muting_and_deleting_shrink_the_csv(store):
    a = learn.save_note(learn.extract_note("Code E11.22 as principal for AKI."))
    learn.save_note(learn.extract_note("Always code J18.9 for pneumonia NOS."))
    assert len(_csv_lines(store, "Learned rules ICD-10.csv")) == 3

    learn.set_active(a["id"], False)                     # muted -> out of the file
    lines = _csv_lines(store, "Learned rules ICD-10.csv")
    assert len(lines) == 2 and lines[1].startswith("J18.9,")

    for n in learn.all_notes():
        learn.delete_note(n["id"])                       # last rule gone -> file gone
    assert _csv_lines(store, "Learned rules ICD-10.csv") is None
    assert registry.get("Learned rules ICD-10") is None


def test_export_failure_never_breaks_saving(monkeypatch, store):
    monkeypatch.setattr(learn, "_export_reference_csvs",
                        lambda: (_ for _ in ()).throw(OSError("disk full")))
    note = learn.save_note(learn.extract_note("Code E11.22 as principal for AKI."))
    assert learn.get_note(note["id"]) is not None
