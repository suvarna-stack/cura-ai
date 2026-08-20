"""Suggest & Learn endpoints — the coder teaches, the index remembers.

The flow the Agent page drives:

  POST /learn/classify  "is this message a question or a rule?"  (nudge only)
  POST /learn/extract   free text -> draft note                  (nothing saved)
  POST /learn/notes     the confirmed/edited draft -> stored + indexed
  GET  /learn/notes     review list (what has this hospital taught?)
  POST /learn/match     which rules apply to this case narrative?

Extraction and saving are deliberately separate calls: nothing enters the
knowledge layer until a human has seen exactly what the AI understood.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.core import learn
from app.models.schemas import (
    AppliedNote,
    ClassifyRequest,
    ClassifyResponse,
    DeleteResponse,
    ExtractNoteRequest,
    LearnedNote,
    MatchNotesRequest,
    MatchNotesResponse,
    NotesResponse,
    SaveNoteRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/learn", tags=["learn"])


@router.post("/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest) -> ClassifyResponse:
    """Teaching or asking? Deterministic cue matching, no model call."""
    return ClassifyResponse(**learn.classify_intent(req.text))


@router.post("/extract", response_model=LearnedNote)
def extract(req: ExtractNoteRequest) -> LearnedNote:
    """Free-text rule -> structured draft for the confirm card. Not stored."""
    draft = learn.extract_note(req.text, created_by=req.created_by)
    if not draft["codes"] and not draft["scenario"]:
        raise HTTPException(
            status_code=400,
            detail="I could not find a coding rule in that message. "
                   "Mention the condition and the code(s) it should get.",
        )
    return LearnedNote(**{**draft, "id": ""})


@router.get("/notes", response_model=NotesResponse)
def list_notes(include_inactive: bool = True) -> NotesResponse:
    return NotesResponse(
        notes=[LearnedNote(**_fill(n))
               for n in learn.all_notes(include_inactive=include_inactive)]
    )


@router.post("/notes", response_model=LearnedNote)
def save_note(req: SaveNoteRequest) -> LearnedNote:
    """Store a confirmed draft and embed it into the shared index.

    Passing an existing `note.id` edits that note in place (its chunk is
    replaced, never duplicated).
    """
    draft = req.note.model_dump()
    if not draft.get("codes") and not draft.get("scenario"):
        raise HTTPException(status_code=400,
                            detail="A note needs at least a scenario or a code.")
    note = learn.save_note(draft, created_by=req.created_by or req.note.created_by)
    return LearnedNote(**_fill(note))


@router.patch("/notes/{note_id}", response_model=LearnedNote)
def toggle_note(note_id: str, active: bool = True) -> LearnedNote:
    """Mute / un-mute a rule without deleting it."""
    note = learn.set_active(note_id, active)
    if note is None:
        raise HTTPException(status_code=404, detail="note not found")
    return LearnedNote(**_fill(note))


@router.delete("/notes/{note_id}", response_model=DeleteResponse)
def delete_note(note_id: str) -> DeleteResponse:
    return DeleteResponse(deleted=1 if learn.delete_note(note_id) else 0)


@router.post("/match", response_model=MatchNotesResponse)
def match(req: MatchNotesRequest) -> MatchNotesResponse:
    """Rules that apply to a narrative — what the case page's callout shows."""
    notes = learn.match_notes(req.text, limit=req.limit)
    return MatchNotesResponse(notes=[_applied(n) for n in notes])


def _applied(note: dict) -> AppliedNote:
    return AppliedNote(
        id=note["id"],
        summary=learn.note_summary(note),
        scenario=note.get("scenario", ""),
        rule=note.get("rule", ""),
        codes=note.get("codes", []),
        created_by=note.get("created_by", ""),
        created_at=note.get("created_at", ""),
        via=f"learned note ({int(note.get('match', 0) * 100)}% match)",
    )


def _fill(note: dict) -> dict:
    """Stored notes predate optional fields; give Pydantic sane defaults."""
    return {"extraction": "", "match": None, **note,
            "id": note.get("id") or ""}
