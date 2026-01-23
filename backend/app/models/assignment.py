from sqlalchemy import Column, Integer, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base

class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=False)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=True)  # Assign to whole class
    student_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Assign to specific student
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    deadline = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, nullable=True) # None = unlimited
    max_attempts = Column(Integer, default=1)

    # Relationships
    paper = relationship("Paper")
    class_ = relationship("ClassModel")
    student = relationship("User")
