from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base

class StudentNotebook(Base):
    __tablename__ = "student_notebook"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"))
    question_id = Column(Integer, ForeignKey("questions.id"))
    original_paper_id = Column(Integer, ForeignKey("papers.id"))

    # Snapshot of what they got wrong
    wrong_answer_given = Column(String, nullable=True)
    
    # AI Analysis
    ai_feedback = Column(Text, nullable=True) # "You confused cause and effect here..."
    review_status = Column(String, default="NEW") # NEW, REVIEWED, MASTERED

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    student = relationship("User")
    question = relationship("Question")
    paper = relationship("Paper")