from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
import requests
from ..database import get_db
from ..models.user import User
from ..auth.jwt import get_current_user, get_password_hash
import os
import uuid
import shutil

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

ALLOWED_AI_PROVIDERS = {"deepseek", "qwen", "gemini", "openrouter"}

class UserProfileUpdate(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None

class TestAIConnectionRequest(BaseModel):
    ai_provider: str
    ai_model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class ModelCatalogRequest(BaseModel):
    ai_provider: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None


def _fetch_openai_compatible_models(base_url: str, api_key: str):
    root = (base_url or "").rstrip("/")
    if not root:
        return []
    token = (api_key or "").strip()
    if not token:
        return []

    try:
        res = requests.get(
            f"{root}/models",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        if res.status_code >= 400:
            return []
        payload = res.json() if res.content else {}
        rows = payload.get("data") if isinstance(payload, dict) else []
        out = []
        for item in rows or []:
            model_id = str((item or {}).get("id") or "").strip()
            if model_id:
                out.append(model_id)
        return sorted(list(set(out)))
    except Exception:
        return []


def _classify_qwen_models(model_ids):
    chat, audio, realtime = [], [], []
    for model_id in model_ids:
        normalized = model_id.lower()
        if "realtime" in normalized or ("omni" in normalized and "qwen3.5" in normalized):
            realtime.append(model_id)
            continue
        if any(token in normalized for token in ["cosyvoice", "tts", "asr", "paraformer", "livetranslate", "audio"]):
            audio.append(model_id)
            continue
        chat.append(model_id)

    # Safe defaults if provider API does not expose full list.
    if not chat:
        chat = ["qwen-plus", "qwen3-max", "qwen-flash", "qwen-turbo"]
    if not audio:
        audio = ["cosyvoice-v3-plus", "cosyvoice-v3-flash", "fun-asr-realtime"]
    if not realtime:
        realtime = ["qwen3.5-omni-plus-realtime", "qwen3.5-omni-flash-realtime"]

    return {
        "chat_models": sorted(list(set(chat))),
        "audio_models": sorted(list(set(audio))),
        "realtime_models": sorted(list(set(realtime))),
    }

@router.get("/me")
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "full_name": current_user.full_name,
        "avatar_url": current_user.avatar_url,
        "ai_provider": current_user.ai_provider,
        "ai_model": current_user.ai_model
    }

@router.put("/me")
def update_user_profile(
    data: UserProfileUpdate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    # If changing username, check uniqueness
    if data.username and data.username != current_user.username:
        existing = db.query(User).filter(User.username == data.username).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = data.username
    
    if data.full_name is not None:
        current_user.full_name = data.full_name
        
    if data.password:
        current_user.password_hash = get_password_hash(data.password)

    if data.ai_provider is not None or data.ai_model is not None:
        if current_user.role not in {"teacher", "admin"}:
            raise HTTPException(status_code=403, detail="Not authorized to change AI settings")
        if data.ai_provider is not None:
            if data.ai_provider not in ALLOWED_AI_PROVIDERS:
                raise HTTPException(status_code=400, detail="Invalid AI provider")
            current_user.ai_provider = data.ai_provider
        if data.ai_model is not None:
            current_user.ai_model = data.ai_model
        
    db.commit()
    db.refresh(current_user)
    return {
        "message": "Profile updated successfully",
        "username": current_user.username,
        "full_name": current_user.full_name,
        "ai_provider": current_user.ai_provider,
        "ai_model": current_user.ai_model
    }

@router.post("/me/avatar")
def upload_avatar(
    file: UploadFile = File(...), 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    upload_dir = "uploads/avatars"
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)
        
    # Generate unique filename
    ext = file.filename.split('.')[-1]
    filename = f"avatar_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    file_path = os.path.join(upload_dir, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Update DB
    # Store relative path for frontend access
    relative_path = f"uploads/avatars/{filename}"
    current_user.avatar_url = relative_path
    db.commit()
    
    return {"avatar_url": relative_path}

@router.post("/test-connection")
def test_ai_connection(
    req: TestAIConnectionRequest,
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only teachers can test AI connection")

    from ..services.ai_generator import _call_chat, _resolve_ai_config

    # Construct options dict to resolve config
    options = {
        "ai_provider": req.ai_provider,
        "ai_model": req.ai_model
    }
    
    provider, model = _resolve_ai_config(options)

    try:
        # Simple prompt to test connection
        system_prompt = "You are a helpful assistant."
        user_prompt = "Reply with 'Connection Successful' and nothing else."
        
        response = _call_chat(
            provider=provider,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=10,
            api_key=req.api_key,
            base_url=req.base_url,
        )
        return {"status": "success", "message": response.strip(), "provider": provider, "model": model}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")


@router.post("/model-catalog")
def get_model_catalog(
    req: ModelCatalogRequest,
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can fetch model catalog")

    provider = (req.ai_provider or "").strip().lower()
    if provider not in ALLOWED_AI_PROVIDERS:
        raise HTTPException(status_code=400, detail="Invalid AI provider")

    if provider == "qwen":
        base_url = (req.base_url or os.getenv("QWEN_BASE_URL") or "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").strip()
        api_key = (req.api_key or os.getenv("QWEN_API_KEY") or "").strip()
        ids = _fetch_openai_compatible_models(base_url, api_key)
        buckets = _classify_qwen_models(ids)
        return {
            "provider": provider,
            "fetched": len(ids) > 0,
            **buckets,
        }

    if provider == "deepseek":
        base_url = (req.base_url or os.getenv("DEEPSEEK_BASE_URL") or "https://api.deepseek.com/v1").strip()
        api_key = (req.api_key or os.getenv("DEEPSEEK_API_KEY") or "").strip()
        ids = _fetch_openai_compatible_models(base_url, api_key)
        if not ids:
            ids = ["deepseek-chat"]
        return {
            "provider": provider,
            "fetched": len(ids) > 0,
            "chat_models": sorted(list(set(ids))),
            "audio_models": [],
            "realtime_models": [],
        }

    if provider == "openrouter":
        base_url = (req.base_url or os.getenv("OPENROUTER_BASE_URL") or "https://openrouter.ai/api/v1").strip()
        api_key = (req.api_key or os.getenv("OPENROUTER_API_KEY") or "").strip()
        ids = _fetch_openai_compatible_models(base_url, api_key)
        if not ids:
            ids = ["openrouter/auto", "openai/gpt-audio-mini", "qwen/qwen3-8b"]
        return {
            "provider": provider,
            "fetched": len(ids) > 0,
            "chat_models": sorted(list(set(ids))),
            "audio_models": [],
            "realtime_models": [],
        }

    # gemini currently uses Vertex model IDs managed by templates.
    return {
        "provider": provider,
        "fetched": False,
        "chat_models": ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"],
        "audio_models": [],
        "realtime_models": [],
    }
