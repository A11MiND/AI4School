from sqlalchemy import Column, Integer, String, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSON
from ..database import Base

class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id"))
    
    # Standardized Content Field (was question_text)
    question_text = Column(String, nullable=False)
    
    # New Field: Type of question (MCQ, SHORT_ANSWER, MATCHING, GAP_FILL)
    question_type = Column(String, default="MCQ") 
    
    options = Column(JSON, nullable=True) # For MCQ options
    
    # Updated: correct_answer flexible field
    correct_answer = Column(JSON, nullable=True) 
    
    # New Field: Flexible schema for complex answers (e.g., keywords for short answer)
    correct_answer_schema = Column(JSON, nullable=True)

    # New Field: Analytics tags
    skill_tag = Column(String, nullable=True) # e.g. "MainIdea", "Inference", "Vocabulary"
    difficulty = Column(Integer, default=1)   # 1 (Easy) to 5 (Hard)

    # Relationships
    paper = relationship("Paper", back_populates="questions")
