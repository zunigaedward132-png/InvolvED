from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.groq_service import get_groq

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    system: str
    messages: list[ChatMessage]
    max_tokens: int = 512


@router.post("/")
def chat(body: ChatRequest):
    client = get_groq()
    all_messages = [{"role": "system", "content": body.system}] + [
        {"role": m.role, "content": m.content} for m in body.messages
    ]
    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=all_messages,
            max_tokens=body.max_tokens,
            temperature=0.5,
        )
        return {"content": completion.choices[0].message.content}
    except Exception as e:
        raise HTTPException(502, f"Groq error: {e}")
