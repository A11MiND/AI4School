from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import json
import os
import re
import random
import hashlib
import base64
import requests
import logging
from uuid import uuid4
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from ..database import get_db
from ..models.paper import Paper
from ..models.question import Question
from ..models.user import User
from ..models.document import Document
from ..auth.jwt import get_current_user
from ..services.ai_generator import generate_dse_questions, grade_open_answer
from ..services.ai_generator import _call_chat, _resolve_ai_config
from ..services.writing_grader import grade_writing_response
from ..services.writing_metrics import compute_writing_metrics, metric_improvement_hints
from ..services.writing_prompt_generator import generate_writing_prompts
from ..services.memory_compression import compress_dialogue, estimate_tokens
from ..services.audio_synthesis import synthesize_role_script_to_wav, synthesize_single_text_to_wav
from ..services.qwen_realtime import probe_qwen_realtime_ws
from ..models.assignment import Assignment
from ..models.student_association import StudentClass
from ..models.submission import Submission, Answer
from ..models.speaking_session import SpeakingSession, SpeakingTurn
from ..models.user_preference import UserPreference
from ..services.llm_access import resolve_llm_access

router = APIRouter(
    prefix="/papers",
    tags=["papers"]
)

logger = logging.getLogger(__name__)

# Pydantic Models
class QuestionBase(BaseModel):
    question_text: str
    question_type: str
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None

class PaperCreate(BaseModel):
    title: str
    article_content: str
    questions: List[QuestionBase]
    class_id: Optional[int] = None
    show_answers: Optional[bool] = True  # Default to showing answers

class GenerateRequest(BaseModel):
    article_content: str
    difficulty: Optional[str] = None
    assessment_objectives: Optional[List[str]] = None
    question_formats: Optional[List[str]] = None
    question_format_counts: Optional[dict] = None
    marking_strictness: Optional[str] = None
    text_type: Optional[str] = None
    text_register: Optional[str] = None
    cognitive_load: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None

class AnswerSubmit(BaseModel):
    question_id: int
    answer: str

class PaperSubmit(BaseModel):
    answers: List[AnswerSubmit]
    assignment_id: Optional[int] = None


class WritingPaperCreate(BaseModel):
    title: str
    task1_prompt: Optional[str] = None
    task2_prompt_pool: List[str] = []
    prompt_asset_url: Optional[str] = None
    show_answers: Optional[bool] = True
    selected_task_mode: Optional[str] = "both"
    source_document_id: Optional[int] = None
    custom_requirements: Optional[str] = None
    writing_config: Optional[Dict[str, Any]] = None


class WritingPromptGenerateRequest(BaseModel):
    selected_task_mode: str
    source_document_id: Optional[int] = None
    source_text: Optional[str] = None
    custom_requirements: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class WritingImageGenerateRequest(BaseModel):
    prompt: str
    model: Optional[str] = "qwen-image"
    api_key: Optional[str] = None
    base_url: Optional[str] = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    size: Optional[str] = "1024x1024"
    n: Optional[int] = 1


class WritingResponseItem(BaseModel):
    question_id: int
    answer: str
    selected_prompt: Optional[str] = None


class WritingSubmitRequest(BaseModel):
    assignment_id: Optional[int] = None
    strictness: Optional[str] = "moderate"
    responses: List[WritingResponseItem]


class ListeningQuestionCreate(BaseModel):
    question_text: str
    question_type: str
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None


class ListeningPaperCreate(BaseModel):
    title: str
    transcript: Optional[str] = None
    audio_url: Optional[str] = None
    role_script: Optional[List[Dict[str, str]]] = None
    questions: List[ListeningQuestionCreate] = []
    show_answers: Optional[bool] = True


class ListeningScriptGenerateRequest(BaseModel):
    prompt: str
    question_count: Optional[int] = 5
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class ListeningAudioSynthesisRequest(BaseModel):
    transcript: Optional[str] = None
    role_script: Optional[List[Dict[str, str]]] = None
    ai_provider: Optional[str] = "qwen"
    ai_model: Optional[str] = "cosyvoice-v3-plus"
    api_key: Optional[str] = None
    base_url: Optional[str] = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    default_voice: Optional[str] = "Ethan"
    role_voice_map: Optional[Dict[str, str]] = None
    sample_rate: Optional[int] = 24000


class SpeakingPaperCreate(BaseModel):
    title: str
    scenario: str
    examiner_persona: Optional[str] = "Friendly examiner"
    starter_prompt: Optional[str] = "Let's begin. Please introduce yourself."
    max_turns: Optional[int] = 12
    rubric_weights: Optional[Dict[str, float]] = None
    show_answers: Optional[bool] = True
    runtime_ai: Optional[Dict[str, Any]] = None


class SpeakingSessionStartRequest(BaseModel):
    assignment_id: Optional[int] = None
    max_context_tokens: Optional[int] = 1200


class SpeakingRealtimeProbeRequest(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = "qwen3.5-omni-plus-realtime"
    ws_url: Optional[str] = "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime"
    voice: Optional[str] = "Ethan"
    timeout_seconds: Optional[int] = 12
    verify_ssl: Optional[bool] = True


class SpeakingTurnRequest(BaseModel):
    role: str
    text: str
    audio_url: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    voice: Optional[str] = None
    tts_model: Optional[str] = None
    tts_api_key: Optional[str] = None
    tts_base_url: Optional[str] = None


def _has_audio_model_capability(provider: Optional[str], model: Optional[str]) -> bool:
    if (provider or "").strip().lower() != "qwen":
        return True
    normalized = (model or "").strip().lower()
    if not normalized:
        return False
    return any(
        token in normalized
        for token in (
            "asr",
            "paraformer",
            "tts",
            "audio",
            "livetranslate",
            "cosyvoice",
            "omni",
            "realtime",
        )
    )


def _parse_role_script_from_transcript(transcript: Optional[str]) -> List[Dict[str, str]]:
    content = (transcript or "").strip()
    if not content:
        return []
    parsed: List[Dict[str, str]] = []
    for line in content.splitlines():
        row = line.strip()
        if not row:
            continue
        matched = re.match(r"^([A-Za-z][A-Za-z0-9_\-]{0,15})\s*[:|]\s*(.+)$", row)
        if matched:
            parsed.append({"role": matched.group(1).strip(), "text": matched.group(2).strip()})
        else:
            parsed.append({"role": "A", "text": row})
    return parsed


def _pick_first_nonempty(*values: Optional[str]) -> Optional[str]:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return None


def _load_user_runtime_ai_preference(db: Session, user_id: Optional[int]) -> Dict[str, Any]:
    if not user_id:
        return {}
    row = db.query(UserPreference).filter(
        UserPreference.user_id == user_id,
        UserPreference.key == "runtime_ai",
    ).first()
    if not row:
        return {}
    try:
        payload = json.loads(row.value)
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _build_dynamic_examiner_fallback(student_text: str, scenario: str, turn_index: int) -> str:
    cleaned = str(student_text or "").strip()
    lower = cleaned.lower()
    if any(token in lower for token in ["can you hear me", "hear me", "hello"]):
        return "Yes, I can hear you clearly. Please introduce yourself and describe one hobby with specific details."
    if any(token in lower for token in ["repeat", "same sentence"]):
        return "Understood. Let's continue: tell me about a recent activity you enjoyed and explain why it was meaningful."
    if len(cleaned.split()) < 4:
        return "Please answer in full sentences and add at least two details."

    followups = [
        "Could you give one concrete example?",
        "Why do you think that is important?",
        "How did that experience affect you?",
        "What would you do differently next time?",
    ]
    picked = followups[turn_index % len(followups)]
    topic = (scenario or "the topic").strip()
    return f"Thanks. Based on {topic}, {picked}"

# Strict objective types - require exact match
STRICT_OBJECTIVE_TYPES = {
    "mcq", "mc", "tf", "true_false", "truefalse", "matching", "table", "objective"
}

# Fill-in-the-blank types - use fuzzy matching
FILL_BLANK_TYPES = {
    "gap", "cloze", "sentence_completion", "phrase_extraction"
}

# For backward compatibility
OBJECTIVE_TYPES = STRICT_OBJECTIVE_TYPES | FILL_BLANK_TYPES

OPEN_TYPES = {
    "short", "short_answer", "long", "open", "summary", "open_ended"
}

def _fuzzy_match_score(student: str, expected: str) -> float:
    """Calculate fuzzy match score between student answer and expected answer."""
    if not student or not expected:
        return 0.0
    
    student_norm = student.strip().lower()
    expected_norm = expected.strip().lower()
    
    # Exact match
    if student_norm == expected_norm:
        return 1.0
    
    # Check if student answer contains the expected answer or vice versa
    if expected_norm in student_norm or student_norm in expected_norm:
        return 0.9
    
    # Check for common word stems (simple stemming)
    student_stem = student_norm.rstrip('s').rstrip('ed').rstrip('ing').rstrip('ly')
    expected_stem = expected_norm.rstrip('s').rstrip('ed').rstrip('ing').rstrip('ly')
    
    if student_stem == expected_stem:
        return 0.85
    
    if expected_stem in student_stem or student_stem in expected_stem:
        return 0.7
    
    # Calculate character-level similarity (simple Levenshtein-like approach)
    max_len = max(len(student_norm), len(expected_norm))
    if max_len == 0:
        return 0.0
    
    # Count matching characters
    matches = sum(1 for a, b in zip(student_norm, expected_norm) if a == b)
    similarity = matches / max_len
    
    if similarity >= 0.8:
        return 0.6
    
    return 0.0

def _normalize_text(text: Optional[str]) -> str:
    if not text:
        return ""
    normalized = text.strip().lower()
    normalized = re.sub(r"[^\w\s]", " ", normalized)

    ordinal_map = {
        "first": "1st",
        "second": "2nd",
        "third": "3rd",
        "fourth": "4th",
        "fifth": "5th",
        "sixth": "6th",
        "seventh": "7th",
        "eighth": "8th",
        "ninth": "9th",
        "tenth": "10th",
        "eleventh": "11th",
        "twelfth": "12th",
        "thirteenth": "13th",
        "fourteenth": "14th",
        "fifteenth": "15th",
        "sixteenth": "16th",
        "seventeenth": "17th",
        "eighteenth": "18th",
        "nineteenth": "19th",
        "twentieth": "20th",
        "thirtieth": "30th",
        "fortieth": "40th",
        "fiftieth": "50th",
        "sixtieth": "60th",
        "seventieth": "70th",
        "eightieth": "80th",
        "ninetieth": "90th",
        "hundredth": "100th",
    }

    for word, replacement in ordinal_map.items():
        normalized = re.sub(rf"\b{word}\b", replacement, normalized)

    return " ".join(normalized.split())

def _to_list(value: Optional[object]) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(v) for v in parsed]
            if isinstance(parsed, dict):
                answer_value = parsed.get("answer")
                if answer_value is not None:
                    return [str(answer_value)]
            return [str(parsed)]
        except Exception:
            return [value]
    return [str(value)]


def _count_words(text: str) -> int:
    return len(re.findall(r"[A-Za-z']+", text or ""))


def _deterministic_prompt_pick(prompt_pool: List[str], user_id: int, paper_id: int, size: int = 4) -> List[str]:
    cleaned = [p.strip() for p in prompt_pool if p and p.strip()]
    if len(cleaned) <= size:
        return cleaned
    seed_input = f"{user_id}:{paper_id}".encode("utf-8")
    seed = int(hashlib.sha256(seed_input).hexdigest(), 16) % (10**12)
    rng = random.Random(seed)
    return rng.sample(cleaned, size)


def _normalize_assignment_deadline(deadline_value: Optional[datetime]) -> Optional[datetime]:
    if deadline_value is None:
        return None
    if deadline_value.tzinfo is None:
        return deadline_value.replace(tzinfo=timezone.utc)
    return deadline_value


def _validate_student_assignment_target(assign: Assignment, student_id: int, db: Session) -> None:
    if assign.student_id is not None and assign.student_id != student_id:
        raise HTTPException(status_code=403, detail="Assignment is not assigned to this student")

    if assign.class_id is not None:
        enrollment = db.query(StudentClass).filter(
            StudentClass.user_id == student_id,
            StudentClass.class_id == assign.class_id,
        ).first()
        if enrollment is None:
            raise HTTPException(status_code=403, detail="Student is not in the assigned class")


def _resolve_student_assignment_access(
    db: Session,
    paper_id: int,
    student_id: int,
    assignment_id: Optional[int],
) -> Optional[Assignment]:
    if assignment_id is not None:
        assign = db.query(Assignment).filter(
            Assignment.id == assignment_id,
            Assignment.paper_id == paper_id,
        ).first()
        if not assign:
            return None
        _validate_student_assignment_target(assign, student_id, db)
        return assign

    assign = db.query(Assignment).filter(
        Assignment.paper_id == paper_id,
        Assignment.student_id == student_id,
    ).first()
    if assign:
        return assign

    class_ids = [
        class_id
        for (class_id,) in db.query(StudentClass.class_id).filter(StudentClass.user_id == student_id).all()
    ]
    if not class_ids:
        return None

    assign = db.query(Assignment).filter(
        Assignment.paper_id == paper_id,
        Assignment.class_id.in_(class_ids),
    ).first()
    if assign:
        _validate_student_assignment_target(assign, student_id, db)
    return assign


def _enforce_assignment_limits(assign: Assignment, student_id: int, db: Session) -> None:
    deadline = _normalize_assignment_deadline(assign.deadline)
    if deadline is not None and datetime.now(timezone.utc) > deadline:
        raise HTTPException(status_code=400, detail="Submission deadline has passed")

    max_attempts = assign.max_attempts or 1
    current_attempts = db.query(Submission).filter(
        Submission.assignment_id == assign.id,
        Submission.student_id == student_id,
    ).count()
    if current_attempts >= max_attempts:
        raise HTTPException(status_code=400, detail="Maximum attempts exceeded")


def _aggregate_submission_score(answer_scores: List[Optional[float]]) -> float:
    values = [float(v) for v in answer_scores if v is not None]
    if not values:
        return 0.0

    # Accept both normalized (0..1) and raw rubric-style (0..10) manual edits.
    normalized_scores = [v / 10.0 if v > 1.0 else v for v in values]
    mean_value = sum(normalized_scores) / len(normalized_scores)
    return max(0.0, min(100.0, mean_value * 100.0))

@router.post("/generate")
def generate_questions(
    request: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only teachers can generate papers")

    llm_access = resolve_llm_access(
        db,
        teacher_id=current_user.id,
        feature="reading.generate",
        provider=request.ai_provider or current_user.ai_provider,
        model=request.ai_model or current_user.ai_model,
        estimated_usage=1,
    )
    if not llm_access.allowed and not request.api_key:
        raise HTTPException(status_code=402, detail=llm_access.deny_reason or "AI access is not available")
    
    options = {
        "difficulty": request.difficulty,
        "assessment_objectives": request.assessment_objectives,
        "question_formats": request.question_formats,
        "question_format_counts": request.question_format_counts,
        "marking_strictness": request.marking_strictness,
        "text_type": request.text_type,
        "register": request.text_register,
        "cognitive_load": request.cognitive_load,
        "ai_provider": llm_access.provider if llm_access.allowed else request.ai_provider,
        "ai_model": llm_access.model if llm_access.allowed else request.ai_model,
        "api_key": llm_access.api_key if llm_access.allowed else request.api_key,
        "base_url": llm_access.base_url if llm_access.allowed else request.base_url,
    }
    try:
        questions_data = generate_dse_questions(request.article_content, options)
        if os.getenv("AI_DEBUG_LOG") == "1":
            print("Generated questions:")
            print(json.dumps(questions_data, ensure_ascii=False, indent=2))
        return questions_data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("")
@router.post("/")
def create_paper(paper: PaperCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only teachers can create papers")
    
    # Create Paper
    # In a full production environment, the teacher would explicitly select a class.
    # Currently, we can default to a general class or require class selection in the future.
    
    new_paper = Paper(
        title=paper.title,
        article_content=paper.article_content, 
        created_by=current_user.id,
        class_id=paper.class_id if paper.class_id else None,
        show_answers=paper.show_answers if paper.show_answers is not None else True
    ) 
    
    db.add(new_paper)
    db.commit()
    db.refresh(new_paper)

    # 2. Create Questions
    for q in paper.questions:
        new_q = Question(
            paper_id=new_paper.id,
            question_text=q.question_text,
            question_type=q.question_type,
            options=q.options,         # SQLAlchemy handles generic JSON
            correct_answer=q.correct_answer # SQLAlchemy handles generic JSON
        )
        db.add(new_q)
    
    db.commit()
    return {"message": "Paper published successfully", "paper_id": new_paper.id}


@router.post("/writing")
def create_writing_paper(
    payload: WritingPaperCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can create writing papers")

    selected_mode = (payload.selected_task_mode or "both").strip().lower()
    if selected_mode not in {"task1", "task2", "both"}:
        raise HTTPException(status_code=400, detail="Invalid selected_task_mode")

    pool = [p.strip() for p in (payload.task2_prompt_pool or []) if p and p.strip()]
    task1_prompt = (payload.task1_prompt or "").strip()

    if selected_mode in {"task1", "both"} and not task1_prompt:
        raise HTTPException(status_code=400, detail="Task 1 prompt is required for selected mode")
    if selected_mode in {"task2", "both"} and len(pool) == 0:
        raise HTTPException(status_code=400, detail="Task 2 prompt pool is required for selected mode")

    paper_config = {
        "mode": "writing",
        "selected_task_mode": selected_mode,
        "task1_enabled": selected_mode in {"task1", "both"},
        "task2_enabled": selected_mode in {"task2", "both"},
        "task2_pick_count": 4,
        "source_document_id": payload.source_document_id,
        "custom_requirements": payload.custom_requirements,
        **(payload.writing_config or {}),
    }

    paper = Paper(
        title=payload.title,
        article_content=None,
        created_by=current_user.id,
        show_answers=payload.show_answers if payload.show_answers is not None else True,
        paper_type="writing",
        writing_config=paper_config,
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)

    questions: List[Question] = []
    if selected_mode in {"task1", "both"}:
        q1 = Question(
            paper_id=paper.id,
            question_text=task1_prompt,
            question_type="writing_task1",
            writing_task_type="task1",
            prompt_asset_url=payload.prompt_asset_url,
        )
        questions.append(q1)
        db.add(q1)

    if selected_mode in {"task2", "both"}:
        q2 = Question(
            paper_id=paper.id,
            question_text="Task 2: Choose ONE prompt and write your response.",
            question_type="writing_task2",
            writing_task_type="task2",
            prompt_asset_url=payload.prompt_asset_url,
            prompt_pool=pool,
            options=pool,
        )
        questions.append(q2)
        db.add(q2)

    db.commit()

    return {
        "message": "Writing paper created",
        "paper_id": paper.id,
        "question_ids": [q.id for q in questions],
    }


@router.post("/writing/generate-prompts")
def generate_writing_prompt_bundle(
    payload: WritingPromptGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can generate writing prompts")

    source_text = (payload.source_text or "").strip()
    if payload.source_document_id is not None:
        doc = db.query(Document).filter(Document.id == payload.source_document_id).first()
        if not doc or doc.is_folder:
            raise HTTPException(status_code=404, detail="Document not found")
        source_text = (doc.content or "").strip() or source_text

    llm_access = resolve_llm_access(
        db,
        teacher_id=current_user.id,
        feature="writing.generate",
        provider=payload.ai_provider or current_user.ai_provider,
        model=payload.ai_model or current_user.ai_model,
        estimated_usage=1,
    )
    if not llm_access.allowed and not payload.api_key:
        raise HTTPException(status_code=402, detail=llm_access.deny_reason or "AI access is not available")

    options = {
        "ai_provider": llm_access.provider if llm_access.allowed else payload.ai_provider,
        "ai_model": llm_access.model if llm_access.allowed else payload.ai_model,
        "api_key": llm_access.api_key if llm_access.allowed else payload.api_key,
        "base_url": llm_access.base_url if llm_access.allowed else payload.base_url,
    }
    try:
        generated = generate_writing_prompts(
            task_mode=payload.selected_task_mode,
            source_text=source_text,
            custom_requirements=payload.custom_requirements,
            options=options,
        )
        return generated
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/writing/generate-image")
def generate_writing_prompt_image(
    payload: WritingImageGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can generate writing prompt images")

    prompt = (payload.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    llm_access = resolve_llm_access(
        db,
        teacher_id=current_user.id,
        feature="writing.image",
        provider="qwen",
        model=payload.model or "qwen-image",
        estimated_usage=1,
    )
    api_key = (llm_access.api_key if llm_access.allowed else payload.api_key or os.getenv("QWEN_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=402, detail=llm_access.deny_reason or "Qwen image access is not available")

    base_url = (
        llm_access.base_url
        or payload.base_url
        or os.getenv("QWEN_BASE_URL")
        or "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    ).strip().rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail="QWEN base URL is required")

    request_body = {
        "model": (payload.model or "qwen-image").strip() or "qwen-image",
        "prompt": prompt,
        "size": (payload.size or "1024x1024").strip() or "1024x1024",
        "n": max(1, min(int(payload.n or 1), 4)),
    }
    try:
        response = requests.post(
            f"{base_url}/images/generations",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=request_body,
            timeout=90,
        )
        if response.status_code >= 400:
            detail = ""
            try:
                detail = response.json().get("error", {}).get("message") or response.text
            except Exception:
                detail = response.text
            raise HTTPException(status_code=400, detail=f"Qwen-image request failed: {detail[:300]}")

        data = response.json() or {}
        items = data.get("data") or []
        if not isinstance(items, list) or len(items) == 0:
            raise HTTPException(status_code=400, detail="Qwen-image returned no image data")

        first = items[0] or {}
        image_url = first.get("url") or first.get("image_url")
        if image_url:
            return {"prompt_asset_url": image_url}

        b64_data = first.get("b64_json") or first.get("b64")
        if b64_data:
            image_bytes = base64.b64decode(b64_data)
            image_name = f"writing_prompt_{uuid4().hex}.png"
            image_dir = os.path.join("uploads", "generated")
            os.makedirs(image_dir, exist_ok=True)
            image_path = os.path.join(image_dir, image_name)
            with open(image_path, "wb") as image_file:
                image_file.write(image_bytes)
            return {"prompt_asset_url": f"/uploads/generated/{image_name}"}

        raise HTTPException(status_code=400, detail="Qwen-image response does not include url or b64 data")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to generate prompt image: {exc}")


@router.post("/speaking/realtime/probe")
def probe_speaking_realtime(
    payload: SpeakingRealtimeProbeRequest,
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can probe realtime speaking models")

    api_key = (payload.api_key or os.getenv("QWEN_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="QWEN_API_KEY is required")

    try:
        result = probe_qwen_realtime_ws(
            api_key=api_key,
            model=(payload.model or "qwen3.5-omni-plus-realtime").strip(),
            base_ws_url=(payload.ws_url or "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime").strip(),
            voice=(payload.voice or "Ethan").strip(),
            timeout_seconds=max(5, min(int(payload.timeout_seconds or 12), 30)),
            verify_ssl=bool(payload.verify_ssl),
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/writing/{paper_id}")
def update_writing_paper(
    paper_id: int,
    payload: WritingPaperCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can update writing papers")

    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if paper.paper_type != "writing":
        raise HTTPException(status_code=400, detail="Not a writing paper")
    if current_user.role != "admin" and paper.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not your paper")

    selected_mode = (payload.selected_task_mode or "both").strip().lower()
    if selected_mode not in {"task1", "task2", "both"}:
        raise HTTPException(status_code=400, detail="Invalid selected_task_mode")

    pool = [p.strip() for p in (payload.task2_prompt_pool or []) if p and p.strip()]
    task1_prompt = (payload.task1_prompt or "").strip()
    if selected_mode in {"task1", "both"} and not task1_prompt:
        raise HTTPException(status_code=400, detail="Task 1 prompt is required for selected mode")
    if selected_mode in {"task2", "both"} and len(pool) == 0:
        raise HTTPException(status_code=400, detail="Task 2 prompt pool is required for selected mode")

    paper.title = payload.title
    paper.show_answers = payload.show_answers if payload.show_answers is not None else paper.show_answers
    paper.writing_config = {
        "mode": "writing",
        "selected_task_mode": selected_mode,
        "task1_enabled": selected_mode in {"task1", "both"},
        "task2_enabled": selected_mode in {"task2", "both"},
        "task2_pick_count": 4,
        "source_document_id": payload.source_document_id,
        "custom_requirements": payload.custom_requirements,
        **(payload.writing_config or {}),
    }

    task1_q = db.query(Question).filter(Question.paper_id == paper_id, Question.writing_task_type == "task1").first()
    task2_q = db.query(Question).filter(Question.paper_id == paper_id, Question.writing_task_type == "task2").first()

    if selected_mode in {"task1", "both"}:
        if task1_q:
            task1_q.question_text = task1_prompt
            task1_q.prompt_asset_url = payload.prompt_asset_url
            task1_q.question_type = "writing_task1"
        else:
            db.add(Question(
                paper_id=paper_id,
                question_text=task1_prompt,
                question_type="writing_task1",
                writing_task_type="task1",
                prompt_asset_url=payload.prompt_asset_url,
            ))
    elif task1_q:
        db.delete(task1_q)

    if selected_mode in {"task2", "both"}:
        if task2_q:
            task2_q.question_text = "Task 2: Choose ONE prompt and write your response."
            task2_q.question_type = "writing_task2"
            task2_q.prompt_asset_url = payload.prompt_asset_url
            task2_q.prompt_pool = pool
            task2_q.options = pool
        else:
            db.add(Question(
                paper_id=paper_id,
                question_text="Task 2: Choose ONE prompt and write your response.",
                question_type="writing_task2",
                writing_task_type="task2",
                prompt_asset_url=payload.prompt_asset_url,
                prompt_pool=pool,
                options=pool,
            ))
    elif task2_q:
        db.delete(task2_q)

    db.commit()
    return {"message": "Writing paper updated", "paper_id": paper.id}


@router.get("/writing/{paper_id}")
def get_writing_paper(
    paper_id: int,
    assignment_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if paper.paper_type != "writing":
        raise HTTPException(status_code=400, detail="Not a writing paper")

    if current_user.role == "teacher" and paper.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not your paper")
    if current_user.role == "student":
        student_assign = _resolve_student_assignment_access(
            db=db,
            paper_id=paper_id,
            student_id=current_user.id,
            assignment_id=assignment_id,
        )
        if student_assign is None:
            raise HTTPException(status_code=403, detail="Not assigned to this paper")
    elif current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Not authorized")

    questions = db.query(Question).filter(Question.paper_id == paper_id).all()
    out_questions = []
    for q in questions:
        item: Dict[str, Any] = {
            "id": q.id,
            "question_text": q.question_text,
            "question_type": q.question_type,
            "writing_task_type": q.writing_task_type,
            "prompt_asset_url": q.prompt_asset_url,
        }
        if q.writing_task_type == "task2":
            item["prompt_options"] = _deterministic_prompt_pick(q.prompt_pool or q.options or [], current_user.id, paper_id, 4)
        out_questions.append(item)

    return {
        "id": paper.id,
        "title": paper.title,
        "paper_type": paper.paper_type,
        "show_answers": paper.show_answers,
        "writing_config": paper.writing_config or {},
        "questions": out_questions,
        "assignment_id": assignment_id,
    }


@router.post("/writing/{paper_id}/submit")
def submit_writing_paper(
    paper_id: int,
    submit: WritingSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if paper.paper_type != "writing":
        raise HTTPException(status_code=400, detail="Not a writing paper")

    assignment = None
    if submit.assignment_id is not None:
        assignment = db.query(Assignment).filter(Assignment.id == submit.assignment_id).first()
        assign = assignment
        if not assign or assign.paper_id != paper_id:
            raise HTTPException(status_code=400, detail="Invalid assignment")
        _validate_student_assignment_target(assign, current_user.id, db)
        _enforce_assignment_limits(assign, current_user.id, db)

    submission = Submission(
        student_id=current_user.id,
        paper_id=paper_id,
        assignment_id=submit.assignment_id,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    question_map = {
        q.id: q for q in db.query(Question).filter(Question.paper_id == paper_id).all()
    }

    total = 0.0
    count = 0
    for r in submit.responses:
        q = question_map.get(r.question_id)
        if not q:
            continue

        prompt_text = q.question_text
        if r.selected_prompt:
            prompt_text = f"{q.question_text}\n\nChosen prompt: {r.selected_prompt}"

        rubric = grade_writing_response(
            prompt_text=prompt_text,
            student_text=r.answer or "",
            rubric_context=None,
            strictness=submit.strictness or "moderate",
        )

        metrics = compute_writing_metrics(r.answer or "")
        hints = metric_improvement_hints(metrics)

        overall_band = float(rubric.get("overall", 0.0))
        normalized = max(0.0, min(1.0, overall_band / 7.0))

        ans = Answer(
            submission_id=submission.id,
            question_id=r.question_id,
            answer=r.answer,
            selected_prompt=r.selected_prompt,
            word_count=_count_words(r.answer or ""),
            is_correct=normalized >= 0.6,
            score=normalized,
            rubric_scores={
                "content": rubric.get("content", 0.0),
                "language": rubric.get("language", 0.0),
                "organization": rubric.get("organization", 0.0),
                "overall": overall_band,
                "summary_feedback": rubric.get("summary_feedback", ""),
                "improvement": rubric.get("improvement", {}),
            },
            writing_metrics={**metrics, "hints": hints},
            sentence_feedback=rubric.get("sentence_feedback", []),
        )
        db.add(ans)

        total += normalized
        count += 1

    submission.score = (total / count) * 100 if count else 0.0
    db.commit()

    return {
        "message": "Writing submitted successfully",
        "submission_id": submission.id,
        "score": submission.score,
    }


@router.post("/listening")
def create_listening_paper(
    payload: ListeningPaperCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can create listening papers")

    paper = Paper(
        title=payload.title,
        article_content=payload.transcript,
        created_by=current_user.id,
        show_answers=payload.show_answers if payload.show_answers is not None else True,
        paper_type="listening",
        writing_config={
            "audio_url": payload.audio_url,
            "role_script": payload.role_script or [],
            "source": "listening",
        },
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)

    for q in payload.questions:
        db.add(Question(
            paper_id=paper.id,
            question_text=q.question_text,
            question_type=q.question_type,
            options=q.options,
            correct_answer=q.correct_answer,
        ))
    db.commit()

    return {"message": "Listening paper created", "paper_id": paper.id}


@router.post("/listening/generate-script")
def generate_listening_script(
    payload: ListeningScriptGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can generate listening script")

    prompt = (payload.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    question_count = max(2, min(int(payload.question_count or 5), 10))

    llm_access = resolve_llm_access(
        db,
        teacher_id=current_user.id,
        feature="listening.generate",
        provider=payload.ai_provider or current_user.ai_provider,
        model=payload.ai_model or current_user.ai_model,
        estimated_usage=1,
    )
    if not llm_access.allowed and not payload.api_key:
        raise HTTPException(status_code=402, detail=llm_access.deny_reason or "AI access is not available")
    provider, model = _resolve_ai_config({
        "ai_provider": llm_access.provider if llm_access.allowed else payload.ai_provider,
        "ai_model": llm_access.model if llm_access.allowed else payload.ai_model,
    })

    system_prompt = (
        "You are an English HKDSE listening paper assistant. "
        "Return strict JSON only. No markdown. Use English only."
    )
    user_prompt = (
        "Generate a listening practice package in JSON with this exact schema:\n"
        "{\n"
        "  \"transcript\": \"...\",\n"
        "  \"role_script\": [{\"role\": \"A\", \"text\": \"...\"}],\n"
        "  \"questions\": [\n"
        "    {\"question_text\": \"...\", \"question_type\": \"mcq\", \"options\": [\"...\"], \"correct_answer\": \"A\"}\n"
        "  ]\n"
        "}\n"
        f"Need exactly {question_count} questions. Mix mcq and short. "
        "For mcq, correct_answer must be a letter like A/B/C/D. "
        f"Topic/context: {prompt}"
    )

    fallback_payload = {
        "transcript": f"A: Hello. We are discussing {prompt}. B: Great, let's begin.",
        "role_script": [
            {"role": "A", "text": f"Hello, today we are discussing {prompt}."},
            {"role": "B", "text": "Great, let's begin the conversation."},
        ],
        "questions": [
            {
                "question_text": "What are the speakers doing?",
                "question_type": "mcq",
                "options": ["Introducing a topic", "Ordering food", "Checking homework", "Booking a flight"],
                "correct_answer": "A",
            },
            {
                "question_text": "Write one key topic mentioned.",
                "question_type": "short",
                "correct_answer": prompt,
            },
        ],
    }

    try:
        raw = _call_chat(
            provider=provider,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.5,
            max_tokens=1600,
            api_key=llm_access.api_key if llm_access.allowed else payload.api_key,
            base_url=llm_access.base_url if llm_access.allowed else payload.base_url,
        )
        text = (raw or "").strip()
        if "```" in text:
            text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()

        parsed = json.loads(text)
        transcript = str(parsed.get("transcript") or "").strip()
        role_script = parsed.get("role_script") or []
        questions = parsed.get("questions") or []

        if not transcript:
            raise ValueError("Missing transcript")
        if not isinstance(role_script, list) or not role_script:
            raise ValueError("Missing role_script")
        if not isinstance(questions, list) or not questions:
            raise ValueError("Missing questions")

        normalized_questions = []
        for q in questions[:question_count]:
            q_type = str(q.get("question_type") or "short").strip().lower()
            q_text = str(q.get("question_text") or "").strip()
            if not q_text:
                continue
            options = q.get("options") if isinstance(q.get("options"), list) else None
            correct = q.get("correct_answer")
            if q_type == "mcq" and isinstance(correct, str):
                match = re.match(r"\s*([A-Da-d])", correct)
                correct = match.group(1).upper() if match else correct
            normalized_questions.append({
                "question_text": q_text,
                "question_type": q_type,
                "options": options,
                "correct_answer": correct,
            })

        if not normalized_questions:
            raise ValueError("No valid questions generated")

        return {
            "transcript": transcript,
            "role_script": [
                {
                    "role": str(item.get("role") or "A").strip(),
                    "text": str(item.get("text") or "").strip(),
                }
                for item in role_script
                if str(item.get("text") or "").strip()
            ],
            "questions": normalized_questions,
            "provider": provider,
            "model": model,
        }
    except Exception:
        return {
            **fallback_payload,
            "provider": provider,
            "model": model,
        }


@router.post("/listening/synthesize-audio")
def synthesize_listening_audio(
    payload: ListeningAudioSynthesisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can synthesize listening audio")

    provider = (payload.ai_provider or "qwen").strip().lower()
    if provider != "qwen":
        raise HTTPException(status_code=400, detail="Only qwen provider is currently supported for TTS synthesis")

    model = (payload.ai_model or "cosyvoice-v3-plus").strip()
    if not _has_audio_model_capability(provider, model):
        raise HTTPException(status_code=400, detail="Selected model does not look like an audio-capable Qwen model")

    role_script = payload.role_script or []
    if not role_script:
        role_script = _parse_role_script_from_transcript(payload.transcript)
    if not role_script:
        raise HTTPException(status_code=400, detail="role_script or transcript is required")

    llm_access = resolve_llm_access(
        db,
        teacher_id=current_user.id,
        feature="listening.tts",
        provider="qwen",
        model=model,
        estimated_usage=1,
    )
    api_key = (llm_access.api_key if llm_access.allowed else payload.api_key or os.getenv("QWEN_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=402, detail=llm_access.deny_reason or "Qwen TTS access is not available")

    base_url = (llm_access.base_url if llm_access.allowed else payload.base_url or os.getenv("QWEN_BASE_URL") or "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").strip()
    sample_rate = int(payload.sample_rate or 24000)
    sample_rate = 24000 if sample_rate <= 0 else sample_rate

    try:
        synthesized = synthesize_role_script_to_wav(
            role_script=role_script,
            model=model,
            default_voice=(payload.default_voice or "Ethan").strip() or "Ethan",
            role_voice_map=payload.role_voice_map,
            api_key=api_key,
            base_url=base_url,
            sample_rate=sample_rate,
        )
        return synthesized
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/listening/{paper_id}")
def update_listening_paper(
    paper_id: int,
    payload: ListeningPaperCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if paper.paper_type != "listening":
        raise HTTPException(status_code=400, detail="Not a listening paper")
    if current_user.role == "teacher" and paper.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not your paper")

    paper.title = payload.title
    paper.article_content = payload.transcript
    paper.show_answers = payload.show_answers if payload.show_answers is not None else True
    paper.writing_config = {
        "audio_url": payload.audio_url,
        "role_script": payload.role_script or [],
        "source": "listening",
    }

    existing_questions = db.query(Question).filter(Question.paper_id == paper_id).all()
    for q in existing_questions:
        db.delete(q)
    db.flush()

    for q in payload.questions:
        db.add(Question(
            paper_id=paper.id,
            question_text=q.question_text,
            question_type=q.question_type,
            options=q.options,
            correct_answer=q.correct_answer,
        ))

    db.commit()
    return {"message": "Listening paper updated", "paper_id": paper.id}


@router.post("/speaking")
def create_speaking_paper(
    payload: SpeakingPaperCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teachers can create speaking papers")

    rubric = payload.rubric_weights or {
        "fluency": 0.35,
        "relevance": 0.35,
        "organization": 0.30,
    }
    paper = Paper(
        title=payload.title,
        article_content=payload.scenario,
        created_by=current_user.id,
        show_answers=payload.show_answers if payload.show_answers is not None else True,
        paper_type="speaking",
        writing_config={
            "scenario": payload.scenario,
            "examiner_persona": payload.examiner_persona,
            "starter_prompt": payload.starter_prompt,
            "max_turns": payload.max_turns,
            "rubric_weights": rubric,
            "runtime_ai": payload.runtime_ai or {},
            "source": "speaking",
        },
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)

    return {"message": "Speaking paper created", "paper_id": paper.id}


@router.put("/speaking/{paper_id}")
def update_speaking_paper(
    paper_id: int,
    payload: SpeakingPaperCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if paper.paper_type != "speaking":
        raise HTTPException(status_code=400, detail="Not a speaking paper")
    if current_user.role == "teacher" and paper.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not your paper")

    rubric = payload.rubric_weights or {
        "fluency": 0.35,
        "relevance": 0.35,
        "organization": 0.30,
    }
    paper.title = payload.title
    paper.article_content = payload.scenario
    paper.show_answers = payload.show_answers if payload.show_answers is not None else True
    paper.writing_config = {
        "scenario": payload.scenario,
        "examiner_persona": payload.examiner_persona,
        "starter_prompt": payload.starter_prompt,
        "max_turns": payload.max_turns,
        "rubric_weights": rubric,
        "runtime_ai": payload.runtime_ai or {},
        "source": "speaking",
    }
    db.commit()
    return {"message": "Speaking paper updated", "paper_id": paper.id}


@router.post("/speaking/{paper_id}/sessions")
def start_speaking_session(
    paper_id: int,
    payload: SpeakingSessionStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if paper.paper_type != "speaking":
        raise HTTPException(status_code=400, detail="Not a speaking paper")

    if current_user.role not in {"student", "teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Not authorized")

    session = SpeakingSession(
        paper_id=paper_id,
        student_id=current_user.id,
        assignment_id=payload.assignment_id,
        max_context_tokens=payload.max_context_tokens or 1200,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    starter_prompt = (paper.writing_config or {}).get("starter_prompt") or "Let's begin. Please introduce yourself."
    starter_turn = SpeakingTurn(
        session_id=session.id,
        turn_index=1,
        speaker_role="examiner",
        text=starter_prompt,
        token_estimate=estimate_tokens(starter_prompt),
    )
    db.add(starter_turn)
    session.token_estimate = starter_turn.token_estimate
    db.commit()

    return {
        "session_id": session.id,
        "starter_prompt": starter_prompt,
        "max_context_tokens": session.max_context_tokens,
    }


@router.post("/speaking/sessions/{session_id}/turns")
def append_speaking_turn(
    session_id: int,
    payload: SpeakingTurnRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(SpeakingSession).filter(SpeakingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.role == "student" and session.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your speaking session")
    if (session.status or "active") != "active":
        raise HTTPException(status_code=400, detail="Session already ended")

    role = payload.role.strip().lower()
    if role not in {"student", "examiner", "system"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    turns = db.query(SpeakingTurn).filter(SpeakingTurn.session_id == session_id).order_by(SpeakingTurn.turn_index.asc()).all()
    next_index = (turns[-1].turn_index + 1) if turns else 1
    new_turn = SpeakingTurn(
        session_id=session_id,
        turn_index=next_index,
        speaker_role=role,
        text=payload.text,
        audio_url=payload.audio_url,
        token_estimate=estimate_tokens(payload.text),
    )
    db.add(new_turn)
    db.flush()

    paper = db.query(Paper).filter(Paper.id == session.paper_id).first()
    active_turns = turns + [new_turn]

    if role == "student":
        scenario = (paper.writing_config or {}).get("scenario") if paper and paper.writing_config else (paper.article_content if paper else "")
        persona = (paper.writing_config or {}).get("examiner_persona") if paper and paper.writing_config else "Friendly examiner"
        runtime_ai_cfg = (paper.writing_config or {}).get("runtime_ai") if paper and paper.writing_config else {}
        recent_turns = "\n".join([
            f"{t.speaker_role}: {t.text}" for t in active_turns[-6:]
        ])
        summary = session.summary_text or ""
        paper_owner = None
        if paper and paper.created_by:
            paper_owner = db.query(User).filter(User.id == paper.created_by).first()
        owner_runtime_ai_cfg = _load_user_runtime_ai_preference(db, paper_owner.id if paper_owner else None)
        request_provider = _pick_first_nonempty(
            payload.ai_provider,
            runtime_ai_cfg.get("ai_provider") if isinstance(runtime_ai_cfg, dict) else None,
            owner_runtime_ai_cfg.get("ai_provider"),
            paper_owner.ai_provider if paper_owner else None,
            current_user.ai_provider,
        )
        request_model = _pick_first_nonempty(
            payload.ai_model,
            runtime_ai_cfg.get("ai_model") if isinstance(runtime_ai_cfg, dict) else None,
            owner_runtime_ai_cfg.get("ai_model"),
            paper_owner.ai_model if paper_owner else None,
            current_user.ai_model,
        )
        request_api_key = _pick_first_nonempty(
            payload.api_key,
            runtime_ai_cfg.get("api_key") if isinstance(runtime_ai_cfg, dict) else None,
            owner_runtime_ai_cfg.get("api_key"),
            owner_runtime_ai_cfg.get("qwen_api_key"),
            owner_runtime_ai_cfg.get("deepseek_api_key"),
            owner_runtime_ai_cfg.get("openrouter_api_key"),
        )
        request_base_url = _pick_first_nonempty(
            payload.base_url,
            runtime_ai_cfg.get("base_url") if isinstance(runtime_ai_cfg, dict) else None,
            owner_runtime_ai_cfg.get("base_url"),
            owner_runtime_ai_cfg.get("qwen_base_url"),
            owner_runtime_ai_cfg.get("deepseek_base_url"),
            owner_runtime_ai_cfg.get("openrouter_base_url"),
        )
        provider, model = _resolve_ai_config({
            "ai_provider": request_provider,
            "ai_model": request_model,
        })
        if paper_owner:
            llm_access = resolve_llm_access(
                db,
                teacher_id=paper_owner.id,
                feature="speaking.dialogue",
                provider=provider,
                model=model,
                estimated_usage=1,
            )
            if llm_access.allowed:
                provider = llm_access.provider
                model = llm_access.model
                request_api_key = request_api_key or llm_access.api_key
                request_base_url = request_base_url or llm_access.base_url
        system_prompt = (
            "You are an English speaking examiner for students. "
            "Use English only. Keep response concise (1-2 sentences), ask one follow-up question, and maintain scenario role."
        )
        user_prompt = (
            f"Scenario: {scenario or 'General oral interview'}\n"
            f"Examiner persona: {persona}\n"
            f"Session summary: {summary}\n"
            f"Recent dialogue:\n{recent_turns}\n\n"
            "Now write the examiner's next turn only."
        )
        try:
            examiner_text = _call_chat(
                provider=provider,
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.4,
                max_tokens=120,
                api_key=request_api_key,
                base_url=request_base_url,
            ).strip()
            if not examiner_text:
                examiner_text = "Thanks. Could you tell me more about that?"
        except Exception as chat_exc:
            logger.exception(
                "Speaking LLM call failed: session=%s provider=%s model=%s has_api_key=%s",
                session_id,
                provider,
                model,
                bool(request_api_key),
            )
            examiner_text = _build_dynamic_examiner_fallback(
                student_text=payload.text,
                scenario=scenario or "",
                turn_index=next_index + 1,
            )

        examiner_audio_url = None
        runtime_tts_model = _pick_first_nonempty(
            runtime_ai_cfg.get("tts_model") if isinstance(runtime_ai_cfg, dict) else None,
            owner_runtime_ai_cfg.get("tts_model"),
        )
        runtime_tts_api_key = _pick_first_nonempty(
            runtime_ai_cfg.get("tts_api_key") if isinstance(runtime_ai_cfg, dict) else None,
            owner_runtime_ai_cfg.get("tts_api_key"),
            owner_runtime_ai_cfg.get("qwen_api_key"),
        )
        runtime_tts_base_url = _pick_first_nonempty(
            runtime_ai_cfg.get("tts_base_url") if isinstance(runtime_ai_cfg, dict) else None,
            owner_runtime_ai_cfg.get("tts_base_url"),
            owner_runtime_ai_cfg.get("qwen_base_url"),
        )
        runtime_tts_voice = _pick_first_nonempty(
            runtime_ai_cfg.get("tts_voice") if isinstance(runtime_ai_cfg, dict) else None,
            owner_runtime_ai_cfg.get("tts_voice"),
        )
        tts_api_key = _pick_first_nonempty(
            payload.tts_api_key,
            runtime_tts_api_key,
            payload.api_key,
            request_api_key,
            os.getenv("QWEN_API_KEY"),
        )
        tts_base_url = _pick_first_nonempty(
            payload.tts_base_url,
            runtime_tts_base_url,
            payload.base_url,
            request_base_url,
            os.getenv("QWEN_BASE_URL"),
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        )
        tts_voice = _pick_first_nonempty(
            payload.voice,
            runtime_tts_voice,
            os.getenv("QWEN_TTS_VOICE"),
            "Ethan",
        ) or "Ethan"
        tts_model_candidates = []
        for candidate in [
            payload.tts_model,
            runtime_tts_model,
            os.getenv("QWEN_TTS_MODEL"),
            "qwen3-tts-instruct-flash",
            "cosyvoice-v3-plus",
        ]:
            item = str(candidate or "").strip()
            if item and item not in tts_model_candidates:
                tts_model_candidates.append(item)

        if tts_api_key and tts_base_url:
            for candidate_model in tts_model_candidates:
                if not _has_audio_model_capability("qwen", candidate_model):
                    continue
                try:
                    examiner_audio_url = synthesize_single_text_to_wav(
                        text=examiner_text,
                        model=candidate_model,
                        voice=tts_voice,
                        api_key=tts_api_key,
                        base_url=tts_base_url,
                    )
                    if examiner_audio_url:
                        break
                except Exception:
                    examiner_audio_url = None

        examiner_turn = SpeakingTurn(
            session_id=session_id,
            turn_index=next_index + 1,
            speaker_role="examiner",
            text=examiner_text,
            audio_url=examiner_audio_url,
            token_estimate=estimate_tokens(examiner_text),
        )
        db.add(examiner_turn)
        db.flush()
        active_turns.append(examiner_turn)

    live_text = " ".join([f"{t.speaker_role}: {t.text}" for t in active_turns if not t.is_compacted])
    token_estimate_total = estimate_tokens(session.summary_text) + estimate_tokens(live_text)

    if token_estimate_total > session.max_context_tokens and len(active_turns) > 4:
        compact_candidates = [t for t in active_turns[:-3] if not t.is_compacted]
        compressed_lines = [f"{t.speaker_role}: {t.text}" for t in compact_candidates]
        session.summary_text = compress_dialogue(session.summary_text, compressed_lines)
        for turn in compact_candidates:
            turn.is_compacted = True
        session.compaction_count = (session.compaction_count or 0) + 1

        remaining_live = " ".join([f"{t.speaker_role}: {t.text}" for t in active_turns if not t.is_compacted])
        token_estimate_total = estimate_tokens(session.summary_text) + estimate_tokens(remaining_live)

    session.token_estimate = token_estimate_total
    db.commit()
    db.refresh(session)

    return {
        "session_id": session.id,
        "turn_id": new_turn.id,
        "turn_index": new_turn.turn_index,
        "auto_reply_added": role == "student",
        "token_estimate": session.token_estimate,
        "compaction_count": session.compaction_count,
    }


@router.post("/speaking/sessions/{session_id}/complete")
def complete_speaking_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(SpeakingSession).filter(SpeakingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.role == "student" and session.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your speaking session")

    if (session.status or "active") == "completed":
        return {"session_id": session.id, "status": "completed"}

    session.status = "completed"
    db.commit()
    db.refresh(session)
    return {"session_id": session.id, "status": session.status}


@router.get("/speaking/sessions/{session_id}")
def get_speaking_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(SpeakingSession).filter(SpeakingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.role == "student" and session.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your speaking session")

    turns = db.query(SpeakingTurn).filter(SpeakingTurn.session_id == session_id).order_by(SpeakingTurn.turn_index.asc()).all()
    return {
        "id": session.id,
        "paper_id": session.paper_id,
        "student_id": session.student_id,
        "status": session.status,
        "summary_text": session.summary_text,
        "token_estimate": session.token_estimate,
        "max_context_tokens": session.max_context_tokens,
        "compaction_count": session.compaction_count,
        "turns": [
            {
                "id": t.id,
                "turn_index": t.turn_index,
                "speaker_role": t.speaker_role,
                "text": t.text,
                "audio_url": t.audio_url,
                "is_compacted": t.is_compacted,
            }
            for t in turns
        ],
    }

@router.get("")
@router.get("/")
def list_papers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Students see papers assigned to them OR their classes
    if current_user.role == "student":
        # 1. Find student's classes
        student_classes = db.query(StudentClass.class_id).filter(StudentClass.user_id == current_user.id).all()
        class_ids = [sc.class_id for sc in student_classes]
        
        # 2. Find assignments matches
        query = db.query(Assignment)
        if class_ids:
             query = query.filter((Assignment.student_id == current_user.id) | (Assignment.class_id.in_(class_ids)))
        else:
             query = query.filter(Assignment.student_id == current_user.id)
             
        assignments = query.all()
        paper_ids = list({a.paper_id for a in assignments})
    
        if not paper_ids:
            return []
            
        # 3. Return papers with assignment stats
        # return db.query(Paper).filter(Paper.id.in_(paper_ids)).all()
        
        papers = db.query(Paper).filter(Paper.id.in_(paper_ids)).all()
        paper_map = {p.id: p for p in papers}

        assignment_ids = [a.id for a in assignments]
        submissions = db.query(Submission).filter(
            Submission.student_id == current_user.id,
            Submission.assignment_id.in_(assignment_ids),
        ).order_by(Submission.submitted_at.desc()).all()

        by_assignment: Dict[int, List[Submission]] = {}
        for sub in submissions:
            if sub.assignment_id is None:
                continue
            by_assignment.setdefault(sub.assignment_id, []).append(sub)

        results = []
        for assign in assignments:
            paper = paper_map.get(assign.paper_id)
            if not paper:
                continue

            subs = by_assignment.get(assign.id, [])
            latest_sub = subs[0] if subs else None

            results.append({
                "id": paper.id,
                "title": paper.title,
                "paper_type": paper.paper_type or "reading",
                "assignment_id": assign.id,
                "deadline": assign.deadline,
                "duration_minutes": assign.duration_minutes,
                "max_attempts": assign.max_attempts,
                "submitted_count": len(subs),
                "latest_score": latest_sub.score if latest_sub else None,
                "latest_submission_id": latest_sub.id if latest_sub else None,
                "status": "completed" if latest_sub else "pending"
            })
        return results
        
    # Teachers see papers they created
    return db.query(Paper).filter(Paper.created_by == current_user.id).all()

@router.delete("/{paper_id}")
def delete_paper(paper_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    if current_user.role != "admin" and paper.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not your paper")

    submission_rows = db.query(Submission.id).filter(Submission.paper_id == paper_id).all()
    submission_ids = [row.id for row in submission_rows]

    speaking_session_rows = db.query(SpeakingSession.id).filter(SpeakingSession.paper_id == paper_id).all()
    speaking_session_ids = [row.id for row in speaking_session_rows]

    # Delete speaking conversations first, because speaking_sessions may reference assignments
    # and papers via foreign keys.
    if speaking_session_ids:
        db.query(SpeakingTurn).filter(SpeakingTurn.session_id.in_(speaking_session_ids)).delete(synchronize_session=False)
        db.query(SpeakingSession).filter(SpeakingSession.id.in_(speaking_session_ids)).delete(synchronize_session=False)

    if submission_ids:
        db.query(Answer).filter(Answer.submission_id.in_(submission_ids)).delete(synchronize_session=False)
        db.query(Submission).filter(Submission.id.in_(submission_ids)).delete(synchronize_session=False)

    db.query(Assignment).filter(Assignment.paper_id == paper_id).delete(synchronize_session=False)
    db.query(Question).filter(Question.paper_id == paper_id).delete(synchronize_session=False)
    db.delete(paper)
    db.commit()
    return {"message": "Paper deleted"}

class PaperUpdate(BaseModel):
    title: Optional[str] = None
    article_content: Optional[str] = None
    show_answers: Optional[bool] = None

@router.put("/{paper_id}")
def update_paper(paper_id: int, update: PaperUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only teachers can update papers")
    
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    if current_user.role != "admin" and paper.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not your paper")
    
    if update.title is not None:
        paper.title = update.title
    if update.article_content is not None:
        paper.article_content = update.article_content
    if update.show_answers is not None:
        paper.show_answers = update.show_answers
    
    db.commit()
    db.refresh(paper)
    return {"message": "Paper updated", "paper": {"id": paper.id, "title": paper.title, "show_answers": paper.show_answers}}

@router.get("/{paper_id}")
def get_paper(
    paper_id: int,
    assignment_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
         raise HTTPException(status_code=404, detail="Paper not found")

    if current_user.role == "teacher" and paper.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not your paper")
    if current_user.role not in {"student", "teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Context: Is this a student taking the paper?
    assignment_info = None
    submission_info = None
    
    # Determine if we should show student view data
    # (Allow if role is student OR if a submission exists for this user)
    
    # 1. Try to find assignment (Student/General)
    assign = None
    if current_user.role == "student":
        if paper.class_id is not None:
            enrolled = db.query(StudentClass).filter(
                StudentClass.user_id == current_user.id,
                StudentClass.class_id == paper.class_id,
            ).first()
            if enrolled is None:
                raise HTTPException(status_code=403, detail="Not assigned to this paper")
        if assignment_id is not None:
            assign = _resolve_student_assignment_access(
                db=db,
                paper_id=paper_id,
                student_id=current_user.id,
                assignment_id=assignment_id,
            )
            if assign is None:
                raise HTTPException(status_code=403, detail="Not assigned to this paper")
        else:
            assign = db.query(Assignment).filter(
                Assignment.paper_id == paper_id,
                Assignment.class_id == paper.class_id,
            ).first()
    elif assignment_id is not None:
        assign = db.query(Assignment).filter(Assignment.id == assignment_id, Assignment.paper_id == paper_id).first()
    
    if assign:
        assignment_info = {
            "deadline": assign.deadline,
            "duration_minutes": assign.duration_minutes,
            "max_attempts": assign.max_attempts
        }
    
    # 2. Check existing submission
    if current_user.role == "student":
        submissions_query = db.query(Submission).filter(
            Submission.paper_id == paper_id,
            Submission.student_id == current_user.id
        )
        submissions = []
        if assignment_id is not None:
            submissions = submissions_query.filter(Submission.assignment_id == assignment_id).all()
        elif assign and assign.id:
            submissions = submissions_query.filter(Submission.assignment_id == assign.id).all()
            if not submissions:
                submissions = submissions_query.all()
        else:
            submissions = submissions_query.all()
        if submissions:
            # Get latest
            last_sub = submissions[-1]
            answers = db.query(Answer).filter(Answer.submission_id == last_sub.id).all()
            submission_info = {
                "id": last_sub.id,
                "score": last_sub.score,
                "submitted_at": last_sub.submitted_at,
                "attempt_count": len(submissions),
                "answers": {a.question_id: a.answer for a in answers}
            }

    # Fetch questions
    questions = db.query(Question).filter(Question.paper_id == paper_id).all()
    
    # For students, hide correct answers if show_answers is False
    questions_data = []
    is_student = current_user.role == "student"
    should_hide_answers = is_student and not paper.show_answers
    
    for q in questions:
        q_data = {
            "id": q.id,
            "question_text": q.question_text,
            "question_type": q.question_type,
            "options": q.options,
            "correct_answer": None if should_hide_answers else q.correct_answer
        }
        questions_data.append(q_data)
    
    return {
        "id": paper.id,
        "title": paper.title,
        "paper_type": paper.paper_type,
        "article_content": paper.article_content,
        "writing_config": paper.writing_config,
        "show_answers": paper.show_answers,
        "questions": questions_data,
        "assignment": assignment_info,
        "submission": submission_info
    }

class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    question_type: Optional[str] = None
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None # Accepts JSON string or plain string

@router.put("/questions/{question_id}")
def update_question(question_id: int, question: QuestionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
        
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    
    # Check paper ownership
    paper = db.query(Paper).filter(Paper.id == q.paper_id).first()
    if paper.created_by != current_user.id and current_user.role != "admin":
         raise HTTPException(status_code=403, detail="Not your paper")

    if question.question_text is not None:
        q.question_text = question.question_text
    if question.question_type is not None:
        q.question_type = question.question_type
    if question.options is not None:
        q.options = question.options
    if question.correct_answer is not None:
        q.correct_answer = question.correct_answer

    db.commit()
    db.refresh(q)
    return q

@router.post("/{paper_id}/submit")
def submit_paper(paper_id: int, submit: PaperSubmit, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Calculate limits (simplified logic, ideally should re-check assignment)

    assignment = None
    if submit.assignment_id is not None:
        assignment = db.query(Assignment).filter(Assignment.id == submit.assignment_id).first()
        assign = assignment
        if not assign or assign.paper_id != paper_id:
            raise HTTPException(status_code=400, detail="Invalid assignment")
        _validate_student_assignment_target(assign, current_user.id, db)
        _enforce_assignment_limits(assign, current_user.id, db)
    
    # Create submission
    sub = Submission(
        student_id=current_user.id,
        paper_id=paper_id,
        assignment_id=submit.assignment_id
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    correct_count = 0.0
    total_q = 0

    # Save answers and calculate initial grade
    for ans in submit.answers:
        new_ans = Answer(
            submission_id=sub.id,
            question_id=ans.question_id,
            answer=ans.answer
        )
        # Check correctness
        q = db.query(Question).filter(Question.id == ans.question_id).first()
        is_correct = False
        score = 0.0
        if q:
            total_q += 1
            q_type = (q.question_type or "").strip().lower()

            if q_type in STRICT_OBJECTIVE_TYPES:
                # Strict matching for MCQ, TF, Matching
                correct_values = _to_list(q.correct_answer)
                student_value = _normalize_text(ans.answer)
                normalized = [_normalize_text(v) for v in correct_values]
                if student_value and student_value in normalized:
                    is_correct = True
                    score = 1.0
                else:
                    score = 0.0
            elif q_type in FILL_BLANK_TYPES:
                # Fuzzy matching for gap/fill-in-blank questions
                correct_values = _to_list(q.correct_answer)
                student_answer = (ans.answer or "").strip()
                best_score = 0.0
                for expected in correct_values:
                    match_score = _fuzzy_match_score(student_answer, expected)
                    best_score = max(best_score, match_score)
                score = best_score
                is_correct = score >= 0.7
            else:
                # AI grading for open-ended questions
                expected = q.correct_answer if q.correct_answer is not None else q.correct_answer_schema
                score = grade_open_answer(
                    question_text=q.question_text,
                    expected_points=expected,
                    student_answer=ans.answer or "",
                    strictness="moderate"
                )
                if score >= 0.6:
                    is_correct = True

            correct_count += score

        new_ans.is_correct = is_correct
        new_ans.score = score
        db.add(new_ans)
    
    # Update total score
    if total_q > 0:
        sub.score = (correct_count / total_q) * 100
    else:
        # Maybe text only?
        sub.score = 0 
        
    db.commit()
    return {"message": "Submitted successfully", "submission_id": sub.id, "score": sub.score}

class GradeUpdate(BaseModel):
    score: float

@router.put("/submissions/answers/{answer_id}/score")
def update_answer_score(answer_id: int, grade: GradeUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
        
    ans = db.query(Answer).filter(Answer.id == answer_id).first()
    if not ans:
        raise HTTPException(status_code=404, detail="Answer not found")

    sub = db.query(Submission).filter(Submission.id == ans.submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    paper = db.query(Paper).filter(Paper.id == sub.paper_id).first()
    if paper is None:
        raise HTTPException(status_code=404, detail="Paper not found")

    if current_user.role != "admin" and paper.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    ans.score = grade.score
    
    all_answers = db.query(Answer).filter(Answer.submission_id == sub.id).all()
    total = _aggregate_submission_score([a.score for a in all_answers])
    sub.score = total
    
    db.commit()
    return {"message": "Score updated", "total_score": total}

@router.get("/students/{student_id}/submissions")
def get_student_submissions(student_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "teacher" and current_user.role != "admin":
         raise HTTPException(status_code=403, detail="Not authorized")
         
    subs = db.query(Submission).filter(Submission.student_id == student_id).all()
    result = []
    for s in subs:
        result.append({
            "id": s.id,
            "paper_title": s.paper.title,
            "submitted_at": s.submitted_at,
            "score": s.score
        })
    return result

@router.get("/submissions/{submission_id}")
def get_submission_detail(submission_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Teacher or the student themselves
    sub = db.query(Submission).filter(Submission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    if current_user.role == "student" and sub.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if current_user.role == "teacher" and sub.paper.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if we should show correct answers
    paper = sub.paper
    is_student = current_user.role == "student"
    should_show_answers = not is_student or paper.show_answers
        
    answers = db.query(Answer).filter(Answer.submission_id == sub.id).all()
    ans_list = []
    for a in answers:
        q = db.query(Question).filter(Question.id == a.question_id).first()
        ans_item = {
            "id": a.id,
            "question_id": a.question_id,
            "question_text": q.question_text if q else "Unknown Question",
            "question_type": q.question_type if q else "unknown",
            "options": q.options if q else None,
            "max_score": 10, # Default max score for display purposes
            "answer": a.answer,
            "is_correct": a.is_correct,
            "score": a.score,
            "word_count": a.word_count,
            "selected_prompt": a.selected_prompt,
            "rubric_scores": a.rubric_scores,
            "writing_metrics": a.writing_metrics,
            "sentence_feedback": a.sentence_feedback,
        }
        # Include correct answer only if allowed
        if should_show_answers and q:
            ans_item["correct_answer"] = q.correct_answer
        ans_list.append(ans_item)
        
    return {
        "id": sub.id,
        "student_name": sub.student.username,
        "paper_title": sub.paper.title,
        "score": sub.score,
        "show_answers": paper.show_answers,
        "answers": ans_list
    }
