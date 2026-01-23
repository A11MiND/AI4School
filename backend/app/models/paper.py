from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
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

    # Relationships
    class_ = relationship("ClassModel")
    creator = relationship("User")
    questions = relationship("Question", back_populates="paper")
