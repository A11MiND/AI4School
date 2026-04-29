from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from ..database import Base


class School(Base):
    __tablename__ = "schools"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    external_ref = Column(String(128), nullable=True, unique=True, index=True)
    status = Column(String(32), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SchoolMembership(Base):
    __tablename__ = "school_memberships"
    __table_args__ = (
        UniqueConstraint("school_id", "user_id", "role", name="uq_school_membership_user_role"),
    )

    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=False, index=True)
    platform = Column(String(64), nullable=False, default="ai4school")
    plan = Column(String(64), nullable=False, default="trial")
    status = Column(String(32), nullable=False, default="active")
    starts_at = Column(DateTime(timezone=True), nullable=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    features_json = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LlmSecret(Base):
    __tablename__ = "llm_secrets"

    id = Column(Integer, primary_key=True, index=True)
    owner_type = Column(String(32), nullable=False)  # edcokey / school / teacher
    owner_id = Column(Integer, nullable=True, index=True)
    provider = Column(String(32), nullable=False)
    base_url = Column(String(512), nullable=True)
    secret_value = Column(Text, nullable=False)
    status = Column(String(32), nullable=False, default="active")
    quota_total = Column(Float, nullable=True)
    quota_used = Column(Float, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LlmUsage(Base):
    __tablename__ = "llm_usage"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=True, index=True)
    platform = Column(String(64), nullable=False, default="ai4school")
    feature = Column(String(128), nullable=False)
    provider = Column(String(32), nullable=False)
    model = Column(String(128), nullable=False)
    key_source = Column(String(32), nullable=False)
    estimated_usage = Column(Float, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GlobalUserMap(Base):
    __tablename__ = "global_user_maps"
    __table_args__ = (
        UniqueConstraint("platform", "local_user_id", name="uq_global_user_map_platform_local"),
    )

    id = Column(Integer, primary_key=True, index=True)
    global_user_id = Column(String(128), nullable=False, index=True)
    platform = Column(String(64), nullable=False)
    local_user_id = Column(String(128), nullable=False)
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=True, index=True)
    class_id = Column(Integer, nullable=True, index=True)
    role = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LearningEvent(Base):
    __tablename__ = "learning_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    global_user_id = Column(String(128), nullable=True, index=True)
    platform = Column(String(64), nullable=False, default="ai4school")
    local_user_id = Column(String(128), nullable=True)
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=True, index=True)
    class_id = Column(Integer, nullable=True, index=True)
    subject = Column(String(64), nullable=True)
    payload_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=True, index=True)
    action = Column(String(128), nullable=False)
    target_type = Column(String(64), nullable=True)
    target_id = Column(String(128), nullable=True)
    metadata_json = Column(Text, nullable=False, default="{}")
    success = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
