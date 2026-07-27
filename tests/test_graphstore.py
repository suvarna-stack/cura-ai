"""Unit tests for the knowledge graph — pure networkx, no models involved."""
import pytest

from app.core.graphstore import GraphStore, _find_sections


@pytest.fixture()
def store(tmp_path, monkeypatch):
    """A GraphStore persisting into a temp dir so tests never touch real data."""
    gs = GraphStore()
    monkeypatch.setattr(type(gs._settings), "graph_dir", tmp_path, raising=False)
    gs._settings = type("S", (), {
        "graph_dir": tmp_path,
        "max_hub_degree": 40,
        "max_per_entity": 3,
        "hop_decay": 0.55,
    })()
    return gs


PAGES = [
    (1, "4.1 Basic concepts\nThe underlying cause is defined here. See Section 4.2 for rules."),
    (2, "4.2 Selection rules\nApply code E10 and code B20.7 when relevant."),
    (3, "More detail on E10 appears here, continuing section 4.2."),
]

RECORDS = [
    {"id": "doc1:p1-c0", "page": 1, "text": PAGES[0][1]},
    {"id": "doc1:p2-c0", "page": 2, "text": PAGES[1][1]},
    {"id": "doc1:p3-c0", "page": 3, "text": PAGES[2][1]},
]


def test_find_sections_infers_ancestors():
    secs = _find_sections([(5, "4.2.1 Find the starting point\nbody text")])
    assert "4.2.1" in secs
    assert "4.2" in secs      # inferred parent
    assert "4" in secs        # inferred grandparent
    assert secs["4.2"]["page"] == 5


def test_find_sections_requires_dot_and_words():
    secs = _find_sections([(1, "4. Rules\n123 456\n4.1 Real heading here")])
    assert "4.1" in secs
    # "4. Rules" (no dot in number pattern requiring a second level) must NOT
    # create a section start of its own — it only exists as inferred ancestor.
    assert secs["4"]["title"] == "(part 4)"


def test_add_document_builds_expected_graph(store):
    counts = store.add_document("doc1", PAGES, RECORDS)
    assert counts["chunks"] == 3

    stats = store.stats()
    assert stats["nodes"]["chunk"] == 3
    assert stats["nodes"]["code"] == 2          # E10, B20.7
    assert stats["edges"]["NEXT"] == 2
    assert stats["edges"]["MENTIONS_CODE"] == 3  # E10 twice (p2, p3) + B20.7
    assert stats["edges"]["REFERENCES"] == 2     # "See Section 4.2" + "section 4.2"


def test_expand_bridges_chunks_via_shared_code(store):
    store.add_document("doc1", PAGES, RECORDS)
    # Seed with the page-2 chunk only; page-3 mentions the same code E10.
    result = store.expand({"doc1:p2-c0": 1.0})
    assert "doc1:p2-c0" in result
    assert "doc1:p3-c0" in result
    score, via = result["doc1:p3-c0"]
    assert 0 < score < 1.0
    assert "E10" in via or "reading order" in via or "section" in via


def test_expand_is_deterministic(store):
    store.add_document("doc1", PAGES, RECORDS)
    a = store.expand({"doc1:p2-c0": 1.0})
    b = store.expand({"doc1:p2-c0": 1.0})
    assert a == b


def test_remove_document_drops_orphan_entities(store):
    store.add_document("doc1", PAGES, RECORDS)
    removed = store.remove_document("doc1")
    assert removed > 0
    stats = store.stats()
    assert stats["nodes_total"] == 0            # codes orphaned -> gone too


def test_sections_namespaced_per_document(store):
    store.add_document("doc1", PAGES, RECORDS)
    store.add_document("doc2", PAGES, [
        {"id": "doc2:p1-c0", "page": 1, "text": PAGES[0][1]},
    ])
    stats = store.stats()
    # Same section numbers in two documents stay separate nodes...
    assert stats["nodes"]["section"] == _expected_sections() * 2
    # ...but code nodes are shared across documents (that is the bridge).
    assert stats["nodes"]["code"] == 2


def _expected_sections():
    return len(_find_sections(PAGES))


def test_graph_persists_across_instances(store, tmp_path):
    store.add_document("doc1", PAGES, RECORDS)
    fresh = GraphStore()
    fresh._settings = store._settings
    assert fresh.stats()["nodes_total"] == store.stats()["nodes_total"]
