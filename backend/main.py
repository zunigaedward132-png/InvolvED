from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.users import router as users_router
from routes.activities import router as activities_router

app = FastAPI(
    title="InvolvED API",
    description="Backend for tracking student extracurriculars with AI-extracted competencies",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to your frontend URL in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(activities_router)


@app.get("/health")
def health():
    return {"status": "ok"}
