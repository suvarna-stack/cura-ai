"""Step 1: one searchable entry per code."""
from app.core import codebook as cb


def test_codes_get_their_dot_back():
    assert cb.normalize_code("J029", cb.ICD10) == "J02.9"
    assert cb.normalize_code("M7910", cb.ICD10) == "M79.10"
    assert cb.normalize_code("J00", cb.ICD10) == "J00"
    assert cb.normalize_code("S52.509", cb.ICD10) == "S52.509"
    assert cb.normalize_code("86.04", cb.ICD9) == "86.04"
    assert cb.normalize_code("Pneumonia", cb.ICD10) is None


def test_bilingual_table_keeps_thai_and_english_and_drops_headings():
    page = ("มาตรฐานเวชระเบียนผู้ป่วยนอก\nICD-10\n"
            "J029\nคอหอยอักเสบเฉียบพลัน\nAcute pharyngitis, unspecified\n"
            "J459\nโรคหืด ไม่ระบุรายละเอียด\nAsthma, unspecified\n"
            "โรคระบบกล้ามเนื้อ\n"
            "S76.4\nกล้ามเนื้อต้นขาฉีกขาด+รหัสสาเหตุ\nInjury of thigh muscle\n")
    got = {e.code: e for e in cb.parse_bilingual_pages([page], "pcu")}
    assert got["J02.9"].title_th == "คอหอยอักเสบเฉียบพลัน"
    assert got["J02.9"].title_en == "Acute pharyngitis, unspecified"
    assert got["J45.9"].title_th == "โรคหืด ไม่ระบุรายละเอียด"   # heading not glued on
    assert got["S76.4"].title_th == "กล้ามเนื้อต้นขาฉีกขาด"     # "+add cause code" dropped


def test_icd9_list_items_are_rebuilt_into_full_names():
    page = ("39.52 Other repair of aneurysm\nRepair of aneurysm by:\ncoagulation\nsuture\n"
            "Excludes: re-entry operation (39.54)\n"
            "86.59 Closure of skin and subcutaneous tissue of other sites\nSutures\n")
    got = {e.code: e for e in cb.parse_icd9_tabular([page], "icd9")}
    assert "Repair of aneurysm by suture" in got["39.52"].terms
    assert "suture" not in got["39.52"].terms
    assert "Sutures" in got["86.59"].terms


def test_first_source_wins_the_title_and_the_rest_become_search_terms():
    merged = cb.merge_entries([
        cb.Entry("J00", cb.ICD10, "Common cold", "", [], ["hospital"]),
        cb.Entry("J00", cb.ICD10, "Acute nasopharyngitis", "ไข้หวัด", [], ["pcu"]),
    ])
    e = merged["J00"]
    assert e.title_en == "Common cold" and e.title_th == "ไข้หวัด"
    assert "Acute nasopharyngitis" in e.terms
    assert e.sources == ["hospital", "pcu"]


def _index():
    return cb.CodebookIndex([
        cb.Entry("J02", cb.ICD10, "Acute pharyngitis"),
        cb.Entry("J02.9", cb.ICD10, "Acute pharyngitis, unspecified", "คอหอยอักเสบเฉียบพลัน"),
        cb.Entry("J31.2", cb.ICD10, "Chronic pharyngitis"),
        cb.Entry("J00", cb.ICD10, "Common cold", "ไข้หวัด"),
        cb.Entry("N40", cb.ICD10, "BPH"),
        cb.Entry("93.94", cb.ICD9, "Therapy [nebulizer]",
                 terms=["Respiratory medication administered by nebulizer"]),
    ])


def test_each_code_is_scored_on_its_own_names():
    hits = _index().search("Acute pharyngitis", system=cb.ICD10)
    assert hits[0].entry.code == "J02.9"           # billable leaf beats its header
    assert hits[1].entry.code == "J02"


def test_thai_names_are_found_without_word_breaks():
    assert _index().search("ไข้หวัด 3 วัน")[0].entry.code == "J00"
    assert _index().search("คอหอยอักเสบ")[0].entry.code == "J02.9"


def test_abbreviated_titles_are_searchable_by_the_full_name():
    hits = _index().search("benign prostatic hyperplasia", system=cb.ICD10)
    assert hits and hits[0].entry.code == "N40"


def test_system_filter_keeps_columns_apart():
    assert all(h.entry.system == cb.ICD9
               for h in _index().search("nebulizer pharyngitis", system=cb.ICD9))


def test_save_and_load_round_trip(tmp_path):
    path = cb.save(_index().entries, tmp_path / "cb.json")
    again = cb.load_entries(path)
    assert {e.code for e in again} == {e.code for e in _index().entries}
