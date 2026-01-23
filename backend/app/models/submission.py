from sqlalchemy import Column, Integer, ForeignKey, DateTime, Float, String, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base

class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"))
    paper_id = Column(Integer, ForeignKey("papers.id"))
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    score = Column(Float, nullable=True)

    # Relationships
    student = relationship("User")
    paper = relationship("Paper")
    answers = relationship("Answer", back_populates="submission")

class Answer(Base):
    __tablename__ = "answers"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"))
    question_id = Column(Integer, ForeignKey("questions.id"))
    answer = Column(String, nullable=True)  # Student's answer
    is_correct = Column(Boolean, nullable=True)
    score = Column(Float, nullable=True) # Manual score

    # Relationships
    submission = relationship("Submission", back_populates="answers")
    question = relationship("Question") # Assuming Question model is imported or available in registry
