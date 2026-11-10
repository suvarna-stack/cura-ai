"""Knowledge graph over the indexed documents (Graph RAG).

Built from structure the documents already have — no LLM extraction:

  nodes: chunk / section / code / chapter
  edges: HAS_SUBSECTION  section -> section   (numbering: 4.2 contains 4.2.3)
         CONTAINS        section -> chunk     (heading positions)
         NEXT            chunk   -> chunk     (reading order, same document)
         MENTIONS_CODE   chunk   -> code      (regex: E10, B20.7, ...)
         REFERENCES      chunk   -> section   ("see Section 4.2.3")
         MENTIONS_CHAPTER chunk  -> chapter   ("Chapter XX")

Section nodes are namespaced per document (two ICD editions both have a
section 4.2.3 and they are different sections). Code and chapter nodes are
shared globally on purpose — `code:E10` linking chunks across editions is
what lets retrieval bridge documents.

Chunk node ids equal the Chroma ids ("{source}:p{page}-c{i}"), so a vector
hit converts to a graph node and back with no lookup table. Chunk text lives
only in Chroma; the graph stores structure.

Persisted as GraphML in `data/graph/kg.graphml` after every mutation.
"""
from __future__ import annotations

import logging
import re
import threading
from collections import defaultdict
from typing import Any

import networkx as nx

from app.config import get_settings

logger = logging.getLogger(__name__)

# ---- entity patterns (same as the grag-ouz notebook) -----------------------

# ICD code: letter + 2 digits, optional .digits  ->  E10, B20.7, I21.9
CODE_RE = re.compile(r"\b([A-Z]\d{2}(?:\.\d+)?)\b")
# "Section 4.2.3" / "section 4.2"
XREF_RE = re.compile(r"[Ss]ection\s+(\d+(?:\.\d+)*)")
# "Chapter XX" in roman numerals
CHAPTER_RE = re.compile(r"\bChapter\s+([IVXLC]+)\b")
# A numbered heading on its own line. At least one dot: bare "4." is a running
# head repeated on every page and would spawn false section starts.
HEADING_RE = re.compile(r"^\s*(\d+(?:\.\d+)+)\s+(\S.{2,70}?)\s*$")


def _find_sections(pages: list[tuple[int, str]]) -> dict[str, dict[str, Any]]:
    """Scan body pages for numbered headings -> {number: info}.

    NOTE: deliberately not parsed from the table of contents — TOC titles wrap
    across lines, stranding the page number, which silently drops entries.
    """
    found: dict[str, dict[str, Any]] = {}
    for page_no, text in pages:
        for line in text.split("\n"):
            m = HEADING_RE.match(line)
            if not m:
                continue
            number, title = m.group(1), m.group(2).strip()
            if not re.search(r"[A-Za-z]{3}", title):
                continue  # titles must contain real words
            found.setdefault(number, {"number": number, "title": title, "page": page_no})

    # A heading "4.2.1" proves "4.2" and "4" exist even if never matched.
    for number in list(found):
        parts = number.split(".")
        for i in range(1, len(parts)):
            anc = ".".join(parts[:i])
            child_page = found[number]["page"]
            if anc not in found:
                found[anc] = {"number": anc, "title": f"(part {anc})", "page": child_page}
            else:
                found[anc]["page"] = min(found[anc]["page"], child_page)
    return found


class GraphStore:
    """Thread-safe wrapper around one persistent networkx MultiDiGraph."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._graph: nx.MultiDiGraph | None = None
        self._lock = threading.Lock()

    @property
    def _path(self):
        return self._settings.graph_dir / "kg.graphml"

    def _ensure_graph(self) -> nx.MultiDiGraph:
        if self._graph is None:
            with self._lock:
                if self._graph is None:
                    if self._path.exists():
                        self._graph = nx.read_graphml(self._path, force_multigraph=True)
                        logger.info(
                            "Graph loaded: %d nodes, %d edges.",
                            self._graph.number_of_nodes(), self._graph.number_of_edges(),
                        )
                    else:
                        self._graph = nx.MultiDiGraph()
        return self._graph

    def _save(self) -> None:
        nx.write_graphml(self._ensure_graph(), self._path)

    # ------------------------------------------------------------------
    def add_document(
        self,
        source: str,
        pages: list[tuple[int, str]],
        records: list[dict[str, Any]],
    ) -> dict[str, int]:
        """Add one document's structure. `records` items need id/page/text.

        Chunk node id == Chroma id, so `records[i]["id"]` must already be the
        namespaced id ("{source}:p{page}-c{i}").
        """
        G = self._ensure_graph()
        with self._lock:
            secs = _find_sections(pages)
            # Sort by (page, depth): if a parent and child start on the same
            # page, the deeper one is matched last by section_for_page below.
            ordered = sorted(secs.values(), key=lambda s: (s["page"], s["number"].count(".")))

            def sec_id(number: str) -> str:
                return f"sec:{source}:{number}"

            for s in ordered:
                G.add_node(sec_id(s["number"]), kind="section", source=source,
                           label=f"{s['number']} {s['title']}", page=s["page"])
            for s in ordered:
                if "." in s["number"]:
                    parent = s["number"].rsplit(".", 1)[0]
                    if sec_id(parent) in G:
                        G.add_edge(sec_id(parent), sec_id(s["number"]), kind="HAS_SUBSECTION")

            def section_for_page(page_no: int) -> str | None:
                current = None
                for s in ordered:
                    if s["page"] <= page_no:
                        current = s["number"]
                    else:
                        break
                return current

            counts: dict[str, int] = defaultdict(int)
            prev_chunk: str | None = None
            for rec in records:
                cid, page, text = rec["id"], rec["page"], rec["text"]
                section = section_for_page(page)
                G.add_node(cid, kind="chunk", source=source, page=page,
                           section=section or "")
                counts["chunks"] += 1

                if section:
                    G.add_edge(sec_id(section), cid, kind="CONTAINS")
                if prev_chunk is not None:
                    G.add_edge(prev_chunk, cid, kind="NEXT")
                prev_chunk = cid

                for code in set(CODE_RE.findall(text)):
                    node = f"code:{code}"
                    if node not in G:
                        G.add_node(node, kind="code", label=code)
                    G.add_edge(cid, node, kind="MENTIONS_CODE")
                    counts["code_mentions"] += 1
                for ref in set(XREF_RE.findall(text)):
                    if ref in secs:
                        G.add_edge(cid, sec_id(ref), kind="REFERENCES")
                        counts["references"] += 1
                for ch in set(CHAPTER_RE.findall(text)):
                    node = f"chap:{ch}"
                    if node not in G:
                        G.add_node(node, kind="chapter", label=f"Chapter {ch}")
                    G.add_edge(cid, node, kind="MENTIONS_CHAPTER")

            counts["sections"] = len(ordered)
            self._save()
        logger.info("Graph: added '%s' (%d chunks, %d sections).",
                    source, counts["chunks"], counts["sections"])
        return dict(counts)

    def remove_document(self, source: str) -> int:
        """Remove a document's chunk and section nodes, then orphaned entities."""
        G = self._ensure_graph()
        with self._lock:
            doomed = [n for n, d in G.nodes(data=True) if d.get("source") == source]
            G.remove_nodes_from(doomed)
            # Entity nodes (codes/chapters) with no remaining edges are noise.
            orphans = [n for n, d in G.nodes(data=True)
                       if d.get("kind") in ("code", "chapter") and G.degree(n) == 0]
            G.remove_nodes_from(orphans)
            self._save()
        logger.info("Graph: removed '%s' (%d nodes, %d orphaned entities).",
                    source, len(doomed), len(orphans))
        return len(doomed)

    def reset(self) -> None:
        with self._lock:
            self._graph = nx.MultiDiGraph()
            self._save()

    # ------------------------------------------------------------------
    def _neighbours(self, G: nx.MultiDiGraph, node: str, kinds: set[str]) -> set[str]:
        """Adjacent nodes following the given edge kinds in BOTH directions."""
        out: set[str] = set()
        for _, v, d in G.out_edges(node, data=True):
            if d.get("kind") in kinds:
                out.add(v)
        for u, _, d in G.in_edges(node, data=True):
            if d.get("kind") in kinds:
                out.add(u)
        return out

    def expand(self, seeds: dict[str, float]) -> dict[str, tuple[float, str]]:
        """One-hop expansion from seed chunks: {chunk_id: (score, via)}.

        Three guards keep this from degenerating into "return everything":
        hub suppression, a per-entity cap, and rarest-entity-first ordering
        (which also makes the walk deterministic).
        """
        s = self._settings
        G = self._ensure_graph()
        entity_kinds = {"MENTIONS_CODE", "REFERENCES", "CONTAINS", "MENTIONS_CHAPTER"}

        found: dict[str, tuple[float, str]] = {
            cid: (score, "vector match") for cid, score in seeds.items() if cid in G
        }
        for cid in list(found):
            base = found[cid][0]

            entities = sorted(self._neighbours(G, cid, entity_kinds),
                              key=lambda e: (G.degree(e), e))
            for ent in entities:
                if G.degree(ent) > s.max_hub_degree:
                    continue
                taken = 0
                for other in sorted(self._neighbours(G, ent, entity_kinds)):
                    if taken >= s.max_per_entity:
                        break
                    if other in found or G.nodes[other].get("kind") != "chunk":
                        continue
                    label = G.nodes[ent].get("label", ent)
                    kind = G.nodes[ent].get("kind", "entity")
                    found[other] = (base * s.hop_decay, f"shares {kind} '{label[:40]}'")
                    taken += 1

            for other in self._neighbours(G, cid, {"NEXT"}):
                if other not in found and G.nodes[other].get("kind") == "chunk":
                    found[other] = (base * s.hop_decay * 0.9, "adjacent in reading order")
        return found

    # ------------------------------------------------------------------
    def stats(self) -> dict[str, Any]:
        G = self._ensure_graph()
        nodes: dict[str, int] = defaultdict(int)
        for _, d in G.nodes(data=True):
            nodes[d.get("kind", "unknown")] += 1
        edges: dict[str, int] = defaultdict(int)
        for _, _, d in G.edges(data=True):
            edges[d.get("kind", "unknown")] += 1
        return {
            "nodes_total": G.number_of_nodes(),
            "edges_total": G.number_of_edges(),
            "nodes": dict(nodes),
            "edges": dict(edges),
        }


_graphstore: GraphStore | None = None


def get_graphstore() -> GraphStore:
    global _graphstore
    if _graphstore is None:
        _graphstore = GraphStore()
    return _graphstore
