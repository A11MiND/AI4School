import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from ..models.control_plane import LlmSecret, LlmUsage, SchoolMembership, Subscription
from ..models.user import User
from ..models.user_preference import UserPreference


DEFAULT_PLATFORM = "ai4school"
ALLOWED_PROVIDERS = {"deepseek", "qwen", "openrouter", "gemini"}
DEFAULT_MODELS = {
    "deepseek": "deepseek-v4-flash",
    "qwen": "qwen-plus",
    "openrouter": "openrouter/auto",
    "gemini": "gemini-2.5-flash-lite",
}
DEFAULT_BASE_URLS = {
    "deepseek": "https://api.deepseek.com",
    "qwen": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "openrouter": "https://openrouter.ai/api/v1",
}
ALLOWED_BASE_HOSTS = {
    "api.deepseek.com",
    "dashscope-intl.aliyuncs.com",
    "dashscope.aliyuncs.com",
    "openrouter.ai",
    "generativelanguage.googleapis.com",
}


@dataclass
class ResolvedLlmAccess:
    allowed: bool
    provider: str
    model: str
    key_source: Optional[str] = None
    server_secret_ref: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    quota_remaining: Optional[float] = None
    deny_reason: Optional[str] = None

    def public_dict(self) -> Dict[str, Any]:
        return {
            "allowed": self.allowed,
            "provider": self.provider,
            "model": self.model,
            "key_source": self.key_source,
            "server_secret_ref": self.server_secret_ref,
            "quota_remaining": self.quota_remaining,
            "deny_reason": self.deny_reason,
        }


def normalize_provider(provider: Optional[str]) -> str:
    item = (provider or os.getenv("DEFAULT_AI_PROVIDER") or "deepseek").strip().lower()
    return item if item in ALLOWED_PROVIDERS else "deepseek"


def normalize_model(provider: str, model: Optional[str]) -> str:
    item = (model or "").strip()
    return item or DEFAULT_MODELS.get(provider, DEFAULT_MODELS["deepseek"])


def validate_base_url(provider: str, base_url: Optional[str]) -> str:
    raw = (base_url or DEFAULT_BASE_URLS.get(provider) or "").strip().rstrip("/")
    if not raw:
        return raw
    parsed = urlparse(raw)
    if parsed.scheme != "https":
        raise ValueError("LLM base_url must use https")
    host = (parsed.hostname or "").lower()
    if host not in ALLOWED_BASE_HOSTS:
        raise ValueError("LLM base_url host is not allowed")
    return raw


def _load_runtime_ai_preference(db: Session, user_id: Optional[int]) -> Dict[str, Any]:
    if not user_id:
        return {}
    row = db.query(UserPreference).filter(
        UserPreference.user_id == user_id,
        UserPreference.key == "runtime_ai",
    ).first()
    if not row:
        return {}
    try:
        return json.loads(row.value) if row.value else {}
    except Exception:
        return {}


def get_user_school_id(db: Session, user_id: Optional[int]) -> Optional[int]:
    if not user_id:
        return None
    membership = db.query(SchoolMembership).filter(
        SchoolMembership.user_id == user_id,
        SchoolMembership.status == "active",
    ).first()
    return membership.school_id if membership else None


def has_active_entitlement(
    db: Session,
    *,
    school_id: Optional[int],
    platform: str = DEFAULT_PLATFORM,
    feature: Optional[str] = None,
) -> bool:
    if not school_id:
        # Development fallback keeps the current single-platform app usable.
        return os.getenv("EDCO_REQUIRE_SUBSCRIPTION", "0") != "1"

    now = datetime.now(timezone.utc)
    rows = db.query(Subscription).filter(
        Subscription.school_id == school_id,
        Subscription.platform == platform,
        Subscription.status == "active",
    ).all()
    for row in rows:
        if row.starts_at and row.starts_at > now:
            continue
        if row.ends_at and row.ends_at < now:
            continue
        if feature:
            try:
                features = json.loads(row.features_json or "[]")
            except Exception:
                features = []
            if features and feature not in features and "*" not in features:
                continue
        return True
    return False


def _secret_quota_remaining(secret: LlmSecret) -> Optional[float]:
    if secret.quota_total is None:
        return None
    return max(float(secret.quota_total or 0) - float(secret.quota_used or 0), 0)


def _find_secret(
    db: Session,
    *,
    owner_type: str,
    owner_id: Optional[int],
    provider: str,
    estimated_usage: float,
) -> Optional[LlmSecret]:
    query = db.query(LlmSecret).filter(
        LlmSecret.owner_type == owner_type,
        LlmSecret.provider == provider,
        LlmSecret.status == "active",
    )
    if owner_id is None:
        query = query.filter(LlmSecret.owner_id.is_(None))
    else:
        query = query.filter(LlmSecret.owner_id == owner_id)
    for row in query.order_by(LlmSecret.id.asc()).all():
        remaining = _secret_quota_remaining(row)
        if remaining is None or remaining >= estimated_usage:
            return row
    return None


def _teacher_byok_from_preference(db: Session, teacher_id: Optional[int], provider: str) -> Optional[Dict[str, str]]:
    pref = _load_runtime_ai_preference(db, teacher_id)
    if not pref:
        return None
    api_key = pref.get("api_key") or pref.get(f"{provider}_api_key")
    if provider == "qwen":
        api_key = api_key or pref.get("tts_api_key")
    if not api_key:
        return None
    base_url = pref.get("base_url") or pref.get(f"{provider}_base_url") or DEFAULT_BASE_URLS.get(provider)
    return {"api_key": str(api_key), "base_url": str(base_url or "")}


def resolve_llm_access(
    db: Session,
    *,
    teacher_id: Optional[int],
    school_id: Optional[int] = None,
    platform: str = DEFAULT_PLATFORM,
    feature: str = "ai.generate",
    provider: Optional[str] = None,
    model: Optional[str] = None,
    estimated_usage: float = 1.0,
    allow_teacher_byok: bool = True,
) -> ResolvedLlmAccess:
    resolved_provider = normalize_provider(provider)
    resolved_model = normalize_model(resolved_provider, model)
    resolved_school_id = school_id or get_user_school_id(db, teacher_id)

    if not has_active_entitlement(db, school_id=resolved_school_id, platform=platform, feature=feature):
        return ResolvedLlmAccess(
            allowed=False,
            provider=resolved_provider,
            model=resolved_model,
            deny_reason="No active subscription or entitlement for this AI feature.",
        )

    candidates = [
        ("edcokey", None),
        ("school_key", resolved_school_id),
    ]
    if allow_teacher_byok:
        candidates.append(("teacher_byok", teacher_id))

    for owner_type, owner_id in candidates:
        secret = _find_secret(
            db,
            owner_type=owner_type,
            owner_id=owner_id,
            provider=resolved_provider,
            estimated_usage=float(estimated_usage or 0),
        )
        if not secret:
            continue
        base_url = validate_base_url(resolved_provider, secret.base_url)
        remaining = _secret_quota_remaining(secret)
        return ResolvedLlmAccess(
            allowed=True,
            provider=resolved_provider,
            model=resolved_model,
            key_source=owner_type,
            server_secret_ref=f"llm_secret:{secret.id}",
            api_key=secret.secret_value,
            base_url=base_url,
            quota_remaining=remaining,
        )

    env_key_name = {
        "deepseek": "DEEPSEEK_API_KEY",
        "qwen": "QWEN_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
        "gemini": "GEMINI_API_KEY",
    }.get(resolved_provider)
    env_key = (os.getenv(env_key_name or "") or "").strip()
    if env_key:
        env_base_name = {
            "deepseek": "DEEPSEEK_BASE_URL",
            "qwen": "QWEN_BASE_URL",
            "openrouter": "OPENROUTER_BASE_URL",
        }.get(resolved_provider)
        env_base = os.getenv(env_base_name or "") or DEFAULT_BASE_URLS.get(resolved_provider)
        return ResolvedLlmAccess(
            allowed=True,
            provider=resolved_provider,
            model=resolved_model,
            key_source="edcokey",
            server_secret_ref=f"env:{env_key_name}",
            api_key=env_key,
            base_url=validate_base_url(resolved_provider, env_base),
            quota_remaining=None,
        )

    if allow_teacher_byok:
        byok = _teacher_byok_from_preference(db, teacher_id, resolved_provider)
        if byok:
            base_url = validate_base_url(resolved_provider, byok.get("base_url"))
            return ResolvedLlmAccess(
                allowed=True,
                provider=resolved_provider,
                model=resolved_model,
                key_source="teacher_byok",
                server_secret_ref=f"user_preference:{teacher_id}:runtime_ai",
                api_key=byok["api_key"],
                base_url=base_url,
                quota_remaining=None,
            )

    return ResolvedLlmAccess(
        allowed=False,
        provider=resolved_provider,
        model=resolved_model,
        deny_reason="No available EdcoKey, school key, or teacher BYOK for this provider.",
    )


def record_llm_usage(
    db: Session,
    *,
    teacher_id: Optional[int],
    school_id: Optional[int],
    platform: str,
    feature: str,
    provider: str,
    model: str,
    key_source: str,
    estimated_usage: float,
) -> LlmUsage:
    row = LlmUsage(
        teacher_id=teacher_id,
        school_id=school_id,
        platform=platform,
        feature=feature,
        provider=provider,
        model=model,
        key_source=key_source,
        estimated_usage=float(estimated_usage or 0),
    )
    db.add(row)
    if key_source in {"edcokey", "school_key", "teacher_byok"}:
        # Only DB-managed secrets have quota counters. BYOK from preferences has no row.
        owner_type = key_source
        query = db.query(LlmSecret).filter(
            LlmSecret.owner_type == owner_type,
            LlmSecret.provider == provider,
            LlmSecret.status == "active",
        )
        if key_source == "edcokey":
            query = query.filter(LlmSecret.owner_id.is_(None))
        elif key_source == "school_key":
            query = query.filter(LlmSecret.owner_id == school_id)
        else:
            query = query.filter(LlmSecret.owner_id == teacher_id)
        secret = query.order_by(LlmSecret.id.asc()).first()
        if secret and secret.quota_total is not None:
            secret.quota_used = float(secret.quota_used or 0) + float(estimated_usage or 0)
    db.commit()
    db.refresh(row)
    return row
