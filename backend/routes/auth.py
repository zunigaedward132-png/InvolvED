from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from passlib.context import CryptContext
from database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class RegisterRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=6)
    role: str = Field(default="member", pattern="^(member|officer|advisor)$")


class LoginRequest(BaseModel):
    first_name: str
    last_name: str
    password: str


def _safe_user(user: dict) -> dict:
    user.pop("password_hash", None)
    return user


@router.post("/register")
def register(body: RegisterRequest):
    db = get_db()
    name = f"{body.first_name.strip()} {body.last_name.strip()}"
    existing = db.table("users").select("id").eq("name", name).execute()
    if existing.data:
        raise HTTPException(409, "An account with that name already exists")
    password_hash = pwd_context.hash(body.password)
    result = db.table("users").insert({
        "name": name,
        "role": body.role,
        "password_hash": password_hash,
    }).execute()
    if not result.data:
        raise HTTPException(500, "Failed to create account")
    return _safe_user(result.data[0])


@router.post("/login")
def login_user(body: LoginRequest):
    db = get_db()
    name = f"{body.first_name.strip()} {body.last_name.strip()}"
    result = db.table("users").select("*").eq("name", name).execute()
    if not result.data:
        raise HTTPException(401, "Name or password is incorrect")
    user = result.data[0]
    if not user.get("password_hash") or not pwd_context.verify(body.password, user["password_hash"]):
        raise HTTPException(401, "Name or password is incorrect")
    return _safe_user(user)
