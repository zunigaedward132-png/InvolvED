from fastapi import APIRouter, HTTPException
from groq import APITimeoutError, APIStatusError
from database import get_db
from models import ActivityCreate, ActivityOut
from services.groq_service import analyze_activity

router = APIRouter(prefix="/activities", tags=["activities"])


@router.post("/", response_model=ActivityOut, status_code=201)
def submit_activity(body: ActivityCreate):
    """
    Full activity lifecycle:
    1. Save raw submission with status=pending_analysis
    2. Call Groq to extract structured metrics
    3. Save AI metrics to ai_metrics table
    4. Update activity status to verified
    5. Return activity + embedded metrics
    """
    db = get_db()

    # 1 ── Save raw activity
    activity_row = db.table("activities").insert({
        "user_id":        str(body.user_id),
        "title":          body.title,
        "category":       body.category,
        "raw_submission": body.raw_submission,
        "status":         "pending_analysis",
    }).execute()

    if not activity_row.data:
        raise HTTPException(500, "Failed to save activity")

    activity = activity_row.data[0]
    activity_id = activity["id"]

    # 2 ── Call Groq
    try:
        metrics = analyze_activity(body.raw_submission)
    except APITimeoutError:
        raise HTTPException(504, "Groq API timed out — try again in a moment")
    except APIStatusError as e:
        raise HTTPException(502, f"Groq API error: {e.message}")
    except ValueError as e:
        raise HTTPException(422, f"Could not parse Groq response: {e}")

    # 3 ── Save AI metrics
    metrics_row = db.table("ai_metrics").insert({
        "activity_id":         activity_id,
        "action_verb":         metrics.get("action_verb"),
        "quantifiable_metric": metrics.get("quantifiable_metric"),
        "competency_tags":     metrics.get("competency_tags", []),
        "linkedin_keywords":   metrics.get("linkedin_keywords", []),
        "raw_groq_response":   metrics,
    }).execute()

    if not metrics_row.data:
        raise HTTPException(500, "Failed to save AI metrics")

    # 4 ── Mark verified
    db.table("activities").update({"status": "verified"}).eq("id", activity_id).execute()

    # 5 ── Return composed response
    activity["status"] = "verified"
    activity["ai_metrics"] = metrics_row.data[0]
    return activity


@router.get("/user/{user_id}", response_model=list[ActivityOut])
def list_user_activities(user_id: str):
    """Return all activities for a user, newest first, with AI metrics joined."""
    db = get_db()

    result = db.table("activities") \
        .select("*, ai_metrics(*)") \
        .eq("user_id", user_id) \
        .order("created_at", desc=True) \
        .execute()

    rows = result.data or []
    for row in rows:
        # Supabase returns the join as a list; flatten to single object or None
        metrics_list = row.get("ai_metrics") or []
        row["ai_metrics"] = metrics_list[0] if metrics_list else None

    return rows


@router.get("/{activity_id}", response_model=ActivityOut)
def get_activity(activity_id: str):
    db = get_db()
    result = db.table("activities") \
        .select("*, ai_metrics(*)") \
        .eq("id", activity_id) \
        .single() \
        .execute()
    if not result.data:
        raise HTTPException(404, "Activity not found")
    row = result.data
    metrics_list = row.get("ai_metrics") or []
    row["ai_metrics"] = metrics_list[0] if metrics_list else None
    return row
