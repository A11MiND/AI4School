from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, backref
from ..database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=True)  # Nullable for folders
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    file_path = Column(String, nullable=True)
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Folder support
    is_folder = Column(Boolean, default=False)
    parent_id = Column(Integer, ForeignKey("documents.id"), nullable=True)

    # Relationships
    uploader = relationship("User")
    children = relationship("Document", backref=backref('parent', remote_side=[id]))
