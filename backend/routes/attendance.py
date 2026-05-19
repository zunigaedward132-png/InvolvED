from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import get_db
import random
import string

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _gen_code() -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


class EventCreate(BaseModel):
    name: str
    date: str | None = None
    location: str | None = None
    created_by: str | None = None


class CheckInRequest(BaseModel):
    code: str
    user_id: str


@router.post("/events")
def create_event(body: EventCreate):
    db = get_db()
    result = db.table("attendance_events").insert({
        "name": body.name,
        "date": body.date,
        "location": body.location,
        "code": _gen_code(),
        "created_by": body.created_by,
        "is_open": True,
    }).execute()
    if not result.data:
        raise HTTPException(500, "Failed to create event")
    return result.data[0]


@router.get("/events")
def list_events():
    db = get_db()
    result = db.table("attendance_events").select("*").order("created_at", desc=True).execute()
    return result.data or []


@router.patch("/events/{event_id}/toggle")
def toggle_event(event_id: str):
    db = get_db()
    existing = db.table("attendance_events").select("is_open").eq("id", event_id).single().execute()
    if not existing.data:
        raise HTTPException(404, "Event not found")
    new_state = not existing.data["is_open"]
    result = db.table("attendance_events").update({"is_open": new_state}).eq("id", event_id).execute()
    return result.data[0]


@router.post("/checkin")
def check_in(body: CheckInRequest):
    db = get_db()
    event = db.table("attendance_events").select("*").eq("code", body.code.upper()).execute()
    if not event.data:
        raise HTTPException(404, "Event not found — check the code")
    ev = event.data[0]
    if not ev["is_open"]:
        raise HTTPException(400, "This event is closed")
    existing = db.table("attendance_records").select("id").eq("event_id", ev["id"]).eq("user_id", body.user_id).execute()
    if existing.data:
        raise HTTPException(409, "Already checked in to this event")
    db.table("attendance_records").insert({
        "event_id": ev["id"],
        "user_id": body.user_id,
    }).execute()
    return {"message": "Checked in!", "event": ev["name"]}


@router.get("/events/{event_id}/summary")
def event_summary(event_id: str):
    db = get_db()
    event = db.table("attendance_events").select("*").eq("id", event_id).single().execute()
    if not event.data:
        raise HTTPException(404, "Event not found")
    records = db.table("attendance_records").select("*, users(name, role)").eq("event_id", event_id).order("checked_in_at").execute()
    return {
        "event": event.data,
        "attendees": records.data or [],
        "count": len(records.data or []),
    }
