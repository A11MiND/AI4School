from sqlalchemy import Column, Integer, Boolean, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base


class DocumentClassVisibility(Base):
    __tablename__ = "document_class_visibility"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False)
    visible = Column(Boolean, default=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    document = relationship("Document")
    class_ = relationship("ClassModel")
