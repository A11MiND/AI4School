import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth.jwt import get_current_user
from ..database import get_db
from ..models.control_plane import GlobalUserMap, LearningEvent, LlmSecret, LlmUsage, School, SchoolMembership, Subscription
from ..models.user import User
from ..services.llm_access import get_user_school_id, has_active_entitlement, record_llm_usage, resolve_llm_access


router = APIRouter(tags=["control-plane"])


class LlmResolveRequest(BaseModel):
    teacher_id: Optional[int] = None
    school_id: Optional[int] = None
    platform: str = "ai4school"
    feature: str = "ai.generate"
    provider: Optional[str] = None
    model: Optional[str] = None
    estimated_usage: Optional[float] = 1.0


class LlmUsageRequest(BaseModel):
    teacher_id: Optional[int] = None
    school_id: Optional[int] = None
    platform: str = "ai4school"
    feature: str
    provider: str
    model: str
    key_source: str
    estimated_usage: Optional[float] = 1.0


class LearningEventRequest(BaseModel):
    event_type: str
    global_user_id: Optional[str] = None
    platform: str = "ai4school"
    local_user_id: Optional[str] = None
    school_id: Optional[int] = None
    class_id: Optional[int] = None
    subject: Optional[str] = None
    payload: Dict[str, Any] = {}


class SchoolCreateRequest(BaseModel):
    name: str
    external_ref: Optional[str] = None


class MembershipCreateRequest(BaseModel):
    user_id: int
    role: str = "teacher"
    status: str = "active"


class SubscriptionCreateRequest(BaseModel):
    school_id: int
    platform: str = "ai4school"
    plan: str = "trial"
    status: str = "active"
    features: list[str] = ["*"]


class LlmSecretCreateRequest(BaseModel):
    owner_type: str
    owner_id: Optional[int] = None
    provider: str
    api_key: str
    base_url: Optional[str] = None
    quota_total: Optional[float] = None


def _require_staff(user: User):
    if user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Teacher or admin access required")


def _require_admin(user: User):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.post("/control/schools")
def create_school(
    payload: SchoolCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="School name is required")
    row = School(name=name, external_ref=(payload.external_ref or "").strip() or None)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "external_ref": row.external_ref, "status": row.status}


@router.post("/control/schools/{school_id}/memberships")
def create_school_membership(
    school_id: int,
    payload: MembershipCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    if payload.role not in {"admin", "teacher", "student"}:
        raise HTTPException(status_code=400, detail="Invalid membership role")
    school = db.query(School).filter(School.id == school_id).first()
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not school or not user:
        raise HTTPException(status_code=404, detail="School or user not found")
    row = db.query(SchoolMembership).filter(
        SchoolMembership.school_id == school_id,
        SchoolMembership.user_id == payload.user_id,
        SchoolMembership.role == payload.role,
    ).first()
    if not row:
        row = SchoolMembership(school_id=school_id, user_id=payload.user_id, role=payload.role)
        db.add(row)
    row.status = payload.status
    db.commit()
    db.refresh(row)
    return {"id": row.id, "school_id": row.school_id, "user_id": row.user_id, "role": row.role, "status": row.status}


@router.post("/control/subscriptions")
def create_subscription(
    payload: SubscriptionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    if not db.query(School).filter(School.id == payload.school_id).first():
        raise HTTPException(status_code=404, detail="School not found")
    row = Subscription(
        school_id=payload.school_id,
        platform=payload.platform,
        plan=payload.plan,
        status=payload.status,
        features_json=json.dumps(payload.features or ["*"]),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "school_id": row.school_id, "platform": row.platform, "plan": row.plan, "status": row.status}


@router.post("/control/llm-secrets")
def create_llm_secret(
    payload: LlmSecretCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    owner_type = (payload.owner_type or "").strip()
    provider = (payload.provider or "").strip().lower()
    if owner_type not in {"edcokey", "school_key", "teacher_byok"}:
        raise HTTPException(status_code=400, detail="Invalid owner_type")
    if provider not in {"deepseek", "qwen", "openrouter", "gemini"}:
        raise HTTPException(status_code=400, detail="Invalid provider")
    if not (payload.api_key or "").strip():
        raise HTTPException(status_code=400, detail="api_key is required")
    row = LlmSecret(
        owner_type=owner_type,
        owner_id=payload.owner_id,
        provider=provider,
        secret_value=payload.api_key.strip(),
        base_url=(payload.base_url or "").strip() or None,
        quota_total=payload.quota_total,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "owner_type": row.owner_type,
        "owner_id": row.owner_id,
        "provider": row.provider,
        "server_secret_ref": f"llm_secret:{row.id}",
        "status": row.status,
    }


@router.get("/me")
def control_plane_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    school_id = get_user_school_id(db, current_user.id)
    memberships = db.query(SchoolMembership).filter(
        SchoolMembership.user_id == current_user.id,
        SchoolMembership.status == "active",
    ).all()
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "school_id": school_id,
        "memberships": [
            {"school_id": item.school_id, "role": item.role, "status": item.status}
            for item in memberships
        ],
    }


@router.get("/me/platforms")
def get_my_platforms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    school_id = get_user_school_id(db, current_user.id)
    platforms = []
    for platform in ["ai4school", "ibl", "assistant"]:
        platforms.append({
            "platform": platform,
            "enabled": has_active_entitlement(db, school_id=school_id, platform=platform),
        })
    return {"school_id": school_id, "platforms": platforms}


@router.get("/entitlements")
def get_entitlements(
    platform: str = "ai4school",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    school_id = get_user_school_id(db, current_user.id)
    rows = []
    if school_id:
        rows = db.query(Subscription).filter(
            Subscription.school_id == school_id,
            Subscription.platform == platform,
        ).all()
    return {
        "school_id": school_id,
        "platform": platform,
        "entitlements": [
            {
                "id": row.id,
                "plan": row.plan,
                "status": row.status,
                "features": json.loads(row.features_json or "[]"),
                "starts_at": row.starts_at.isoformat() if row.starts_at else None,
                "ends_at": row.ends_at.isoformat() if row.ends_at else None,
            }
            for row in rows
        ],
    }


@router.post("/llm/resolve")
def resolve_llm(
    payload: LlmResolveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    teacher_id = payload.teacher_id or current_user.id
    if current_user.role != "admin" and teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot resolve another teacher's LLM access")
    resolved = resolve_llm_access(
        db,
        teacher_id=teacher_id,
        school_id=payload.school_id,
        platform=payload.platform,
        feature=payload.feature,
        provider=payload.provider or current_user.ai_provider,
        model=payload.model or current_user.ai_model,
        estimated_usage=float(payload.estimated_usage or 0),
    )
    return resolved.public_dict()


@router.post("/llm/usage")
def create_llm_usage(
    payload: LlmUsageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    teacher_id = payload.teacher_id or current_user.id
    if current_user.role != "admin" and teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot record another teacher's usage")
    row = record_llm_usage(
        db,
        teacher_id=teacher_id,
        school_id=payload.school_id or get_user_school_id(db, teacher_id),
        platform=payload.platform,
        feature=payload.feature,
        provider=payload.provider,
        model=payload.model,
        key_source=payload.key_source,
        estimated_usage=float(payload.estimated_usage or 0),
    )
    return {"id": row.id, "created_at": row.created_at.isoformat() if row.created_at else None}


@router.post("/events/learning")
def create_learning_event(
    payload: LearningEventRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event_type = (payload.event_type or "").strip()
    if not event_type:
        raise HTTPException(status_code=400, detail="event_type is required")
    row = LearningEvent(
        event_type=event_type,
        global_user_id=payload.global_user_id,
        platform=payload.platform,
        local_user_id=payload.local_user_id,
        school_id=payload.school_id,
        class_id=payload.class_id,
        subject=payload.subject,
        payload_json=json.dumps(payload.payload or {}, ensure_ascii=False),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "event_type": row.event_type}


@router.get("/schools/{school_id}/students/summary")
def get_school_students_summary(
    school_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_staff(current_user)
    if current_user.role != "admin" and get_user_school_id(db, current_user.id) != school_id:
        raise HTTPException(status_code=403, detail="Not authorized for this school")
    mappings = db.query(GlobalUserMap).filter(GlobalUserMap.school_id == school_id).all()
    usage_count = db.query(LlmUsage).filter(LlmUsage.school_id == school_id).count()
    return {
        "school_id": school_id,
        "student_count": len([m for m in mappings if m.role == "student"]),
        "platforms": sorted({m.platform for m in mappings}),
        "llm_usage_count": usage_count,
        "students": [
            {
                "global_user_id": item.global_user_id,
                "platform": item.platform,
                "local_user_id": item.local_user_id,
                "class_id": item.class_id,
                "role": item.role,
                "status": item.status,
            }
            for item in mappings
        ],
    }
