from fastapi import APIRouter, HTTPException
from database import get_db
from models import UserCreate, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/", response_model=UserOut, status_code=201)
def create_user(body: UserCreate):
    db = get_db()
    result = db.table("users").insert(body.model_dump(exclude_none=True)).execute()
    if not result.data:
        raise HTTPException(500, "Failed to create user")
    return result.data[0]


@router.post("/upsert", response_model=UserOut)
def upsert_user(body: UserCreate):
    """Return existing user by email, or create a new one."""
    db = get_db()
    if body.email:
        existing = db.table("users").select("*").eq("email", body.email).execute()
        if existing.data:
            return existing.data[0]
    result = db.table("users").insert(body.model_dump(exclude_none=True)).execute()
    if not result.data:
        raise HTTPException(500, "Failed to create user")
    return result.data[0]


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: str):
    db = get_db()
    result = db.table("users").select("*").eq("id", user_id).single().execute()
    if not result.data:
        raise HTTPException(404, "User not found")
    return result.data
