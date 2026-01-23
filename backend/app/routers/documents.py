from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.document import Document
from ..models.user import User
from ..auth.jwt import get_current_user
import io
import pypdf
import pdfplumber
import docx
import shutil
import os
import uuid
import datetime
from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse

router = APIRouter(
    prefix="/documents",
    tags=["documents"]
)

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None

class DocumentResponse(BaseModel):
    id: int
    title: str
    file_path: Optional[str] = None
    is_folder: bool
    parent_id: Optional[int] = None
    uploaded_by: int
    created_at: Optional[datetime.datetime] = None  # Add created_at
    
    class Config:
        orm_mode = True

def extract_text_from_file(file_content: bytes, filename: str) -> str:
    text = ""
    if filename.endswith(".pdf"):
        # 1. Try pypdf
        try:
            pdf_reader = pypdf.PdfReader(io.BytesIO(file_content))
            for page in pdf_reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
        except Exception as e:
            print(f"PyPDF extraction failed: {e}")
            
        # 2. Key Check: If pypdf failed or returned little text, try pdfplumber
        if len(text.strip()) < 50:
            try:
                 with pdfplumber.open(io.BytesIO(file_content)) as pdf:
                     plumber_text = ""
                     for page in pdf.pages:
                         plumber_text += (page.extract_text() or "") + "\n"
                     
                     if len(plumber_text.strip()) > len(text.strip()):
                         text = plumber_text
            except Exception as e:
                print(f"PDFPlumber extraction failed: {e}")
            
    elif filename.endswith(".docx"):
        try:
            doc = docx.Document(io.BytesIO(file_content))
            for para in doc.paragraphs:
                text += para.text + "\n"
        except Exception:
            return ""
            
    elif filename.endswith(".txt"):
        try:
            text = file_content.decode("utf-8")
        except:
             return ""
    
    return text.strip()

@router.post("/create_folder")
def create_folder(
    folder: FolderCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only teachers can create folders")
        
    new_folder = Document(
        title=folder.name,
        is_folder=True,
        parent_id=folder.parent_id,
        uploaded_by=current_user.id
    )
    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)
    return new_folder

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...), 
    parent_id: Optional[int] = Form(None),
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only teachers can upload documents")
    
    content_bytes = await file.read()

    # Save file to disk
    upload_dir = "uploads"
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)
        
    unique_filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(upload_dir, unique_filename)
    
    with open(file_path, "wb") as f:
        f.write(content_bytes)

    extracted_text = extract_text_from_file(content_bytes, file.filename)
    
    if not extracted_text:
        extracted_text = None
    
    new_doc = Document(
        title=file.filename,
        content=extracted_text,
        file_path=file_path, # Add path
        uploaded_by=current_user.id,
        parent_id=parent_id
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    
    return {"message": "Document uploaded successfully", "id": new_doc.id}

@router.get("/", response_model=List[DocumentResponse])
def list_documents(
    parent_id: Optional[int] = None,
    uploaded_by: Optional[int] = None,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["teacher", "admin", "student"]:
        raise HTTPException(status_code=403, detail="Authorized personnel only")
    
    query = db.query(Document)
    
    # Filter by uploader
    if current_user.role == "teacher":
        query = query.filter(Document.uploaded_by == current_user.id)
    elif uploaded_by:
        query = query.filter(Document.uploaded_by == uploaded_by)
    
    if parent_id is not None:
        query = query.filter(Document.parent_id == parent_id)
    else:
        query = query.filter(Document.parent_id == None)
        
    return query.all()

@router.get("/{document_id}")
def get_document(document_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
     doc = db.query(Document).filter(Document.id == document_id).first()
     if not doc:
         raise HTTPException(status_code=404, detail="Document not found")
     return doc

@router.delete("/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
    return {"message": "Document deleted"}

@router.get("/{doc_id}/download")
def download_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if current_user.role != "teacher" and current_user.role != "admin":
         if doc.uploaded_by != current_user.id:
             raise HTTPException(status_code=403, detail="Not authorized")

    if not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found on server")
        
    return FileResponse(doc.file_path, filename=doc.title)
