import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from routes.users import router as users_router
from routes.activities import router as activities_router
from routes.chat import router as chat_router
from routes.auth import router as auth_router
from routes.attendance import router as attendance_router

app = FastAPI(
    title="InvolvED API",
    description="Backend for tracking student extracurriculars with AI-extracted competencies",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(activities_router)
app.include_router(chat_router)
app.include_router(auth_router)
app.include_router(attendance_router)

# Serve the frontend from the repo root
_FRONTEND = os.path.join(os.path.dirname(__file__), "..", "index.html")

@app.get("/", response_class=HTMLResponse)
def serve_frontend():
    with open(_FRONTEND) as f:
        return f.read()

@app.get("/health")
def health():
    return {"status": "ok"}
