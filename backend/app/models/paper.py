from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base

class Paper(Base):
    __tablename__ = "papers"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    article_content = Column(String, nullable=True) # Added for student reading view
    class_id = Column(Integer, ForeignKey("classes.id"))
    created_by = Column(Integer, ForeignKey("users.id"))  # teacher_id
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    show_answers = Column(Boolean, default=True)  # Whether to show correct answers to students after submission
    paper_type = Column(String, default="reading")  # reading|writing
    writing_config = Column(JSON, nullable=True)  # task/anti-cheat/rubric configuration for writing papers

    # Relationships
    class_ = relationship("ClassModel")
    creator = relationship("User")
    questions = relationship("Question", back_populates="paper")
