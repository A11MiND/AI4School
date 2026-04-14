from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base

class ClassModel(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    teacher_id = Column(Integer, ForeignKey("users.id"))
    invite_code = Column(String, unique=True, index=True, nullable=True)

    # Relationships
    teacher = relationship("User", backref="classes")
    students = relationship("StudentClass", back_populates="class_")
