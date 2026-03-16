from sqlalchemy import Column, Integer, ForeignKey, DateTime, Float, String, Boolean, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base

class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"))
    paper_id = Column(Integer, ForeignKey("papers.id"))
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=True)
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
    word_count = Column(Integer, nullable=True)
    rubric_scores = Column(JSON, nullable=True)       # {"content": 0-7, "language": 0-7, "organization": 0-7, "overall": 0-7}
    writing_metrics = Column(JSON, nullable=True)     # Selected 9 lexical/syntactic/cohesion metrics
    sentence_feedback = Column(JSON, nullable=True)   # [{"sentence":...,"issue":...,"suggestion":...}]
    selected_prompt = Column(String, nullable=True)   # Chosen task2 prompt text (for audit/review)

    # Relationships
    submission = relationship("Submission", back_populates="answers")
    question = relationship("Question") # Assuming Question model is imported or available in registry
