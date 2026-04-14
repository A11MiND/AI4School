from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base


class SpeakingSession(Base):
    __tablename__ = "speaking_sessions"

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=True)
    status = Column(String, default="active")  # active|completed|abandoned
    summary_text = Column(Text, nullable=True)
    token_estimate = Column(Integer, default=0)
    max_context_tokens = Column(Integer, default=1200)
    compaction_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    paper = relationship("Paper")
    student = relationship("User")
    turns = relationship("SpeakingTurn", back_populates="session", cascade="all, delete-orphan")


class SpeakingTurn(Base):
    __tablename__ = "speaking_turns"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("speaking_sessions.id"), nullable=False)
    turn_index = Column(Integer, nullable=False)
    speaker_role = Column(String, nullable=False)  # examiner|student|system
    text = Column(Text, nullable=False)
    audio_url = Column(String, nullable=True)
    token_estimate = Column(Integer, default=0)
    is_compacted = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("SpeakingSession", back_populates="turns")
