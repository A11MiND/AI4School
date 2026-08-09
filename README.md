<div align="center">
  <img src="AI4School_icon.png" alt="AI4School logo" width="120" height="120">
  <h1>AI4School</h1>
</div>

![CI](https://github.com/A11MiND/AI4School/actions/workflows/ci.yml/badge.svg)
![Python](https://img.shields.io/badge/python-FastAPI-009688)
![Next.js](https://img.shields.io/badge/frontend-Next.js%2014-black)

An AI-assisted exam and classroom management platform: teachers upload course materials, generate exam papers from them with an LLM, assign the papers to classes, and review analytics; students take papers online and get instant feedback on objective questions.

## Overview

AI4School is a two-portal application — a teacher side and a student side — backed by a FastAPI service and a Next.js frontend. Teachers upload reference documents (PDF/DOCX/TXT), generate exam questions from that material through an LLM, review and edit the generated paper, then assign it to a class with a deadline and duration. Students see assigned work on their dashboard, take the paper against a timer, and get immediate scoring on objective (MCQ) items, with results and teacher grading available afterward for open-ended questions. Teachers get class-level and student-level analytics on top of submission data.

Beyond the core exam workflow, the backend also includes: spoken-response papers backed by real-time audio synthesis, a multi-school "control plane" (schools, subscriptions, per-school/teacher LLM credentials and usage tracking), and an adapter API for single sign-on and user/class sync from an external platform.

## Features

- **Document management** — upload and organize PDF/DOCX/TXT reference material per class, with per-document visibility control
- **AI paper generation** — generate MCQ and open-ended questions from uploaded material via an LLM, then edit before publishing
- **Class & assignment management** — create classes, manage rosters (including CSV import and invite codes), assign papers with deadlines and durations
- **Student exam experience** — timed paper-taking UI, instant auto-grading for objective questions, manual grading workflow for open-ended answers
- **Speaking papers** — oral assessment papers with real-time audio synthesis and turn-by-turn session tracking
- **Analytics** — class overview, weak-skill breakdown, per-student performance and reports for teachers; progress reports for students
- **Multi-school control plane** — schools, school memberships, subscriptions, and per-owner LLM credentials/usage quotas, for deployments serving more than one school
- **Platform adapter / SSO** — endpoints for syncing users and classes from, and launching sessions from, an external platform
- **Role-based access** — student / teacher / admin roles with JWT authentication

## Tech stack

- **Backend**: FastAPI, SQLAlchemy, JWT auth (python-jose, passlib/bcrypt), pytest
- **Frontend**: Next.js 14 (Pages Router), TypeScript, Tailwind CSS, Axios, Recharts, Jest + Testing Library
- **Database**: PostgreSQL by default (`DATABASE_URL`), SQLite supported for local/dev/test use
- **AI**: OpenAI-compatible chat completions API (question generation, speaking assessment)
- **CI**: GitHub Actions — backend `pytest` and frontend `npm test` on every push/PR (`.github/workflows/ci.yml`)

## Project structure

```
backend/
├── app/
│   ├── main.py            # FastAPI app, CORS, router registration
│   ├── database.py         # SQLAlchemy engine/session
│   ├── auth/                # JWT auth
│   ├── models/               # SQLAlchemy models (users, classes, papers, submissions, speaking, control plane, ...)
│   ├── routers/                # API endpoints (auth, papers, classes, assignments, analytics, documents, adapter, control_plane, users)
│   └── services/                 # ai_generator.py, audio_synthesis.py, llm_access.py
├── migrations/             # Hand-written SQL migrations
├── seed.py, init_admin.py    # Seed/admin helper scripts
└── tests/                  # pytest suite

frontend/
├── pages/
│   ├── student/             # Student login, dashboard, exam UI, results, report
│   ├── teacher/               # Teacher login, dashboard, documents, paper builder, classes, grading, analytics
│   └── sso/launch.tsx           # SSO landing page
├── components/               # Sidebar, Layout, shared UI
├── utils/api.ts                # Axios client (student/teacher token switching, 401 interceptor)
└── __tests__/                 # Jest test suite

docs/                        # Sphinx documentation (API reference, data models, workflows)
```

## Installation

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set DATABASE_URL, JWT_SECRET_KEY, ALLOWED_ORIGINS, etc.
```

Set `DATABASE_URL` to a Postgres instance, or use SQLite for quick local testing (e.g. `sqlite:///./local.db`).

```bash
python seed.py          # optional: seed sample data
uvicorn app.main:app --reload
```

The API is served at `http://127.0.0.1:8000`, with interactive docs at `/docs` (Swagger UI) and `/redoc` (ReDoc).

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_API_BASE_URL / API_PROXY_TARGET as needed
npm run dev
```

The frontend runs on `http://localhost:3002` (`next dev -p 3002`).

## Testing

```bash
# backend
cd backend && pytest

# frontend
cd frontend && npm test
```

Both suites run automatically in CI on push and pull request against `main`.

## Documentation

Sphinx docs live under `docs/` (overview, backend/frontend structure, data models, API endpoints, dev setup). Build them with:

```bash
cd docs
pip install sphinx
sphinx-build -b html . _build
```

## Status

Actively developed. Core teacher/student exam workflow, analytics, and speaking assessments are implemented; the multi-school control plane and external-platform adapter are present in the codebase for deployments that need to integrate with an outside system, but are not required for standalone use.
