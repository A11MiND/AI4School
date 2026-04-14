from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base


class ClassInviteCode(Base):
    __tablename__ = "class_invite_codes"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False, index=True)
    code = Column(String, nullable=False, unique=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    max_uses = Column(Integer, nullable=True)
    used_count = Column(Integer, nullable=False, default=0)
    revoked = Column(Boolean, nullable=False, default=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    class_ = relationship("ClassModel")
    creator = relationship("User")
