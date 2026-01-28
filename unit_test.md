# Unit Test Report

Date: 2026-01-27

## Summary
- Status: ✅ Passed
- Total: 43 tests (backend: 21, frontend: 22)
- Warnings: backend deprecations + frontend act/Recharts warnings

## Scope
### Backend (FastAPI)
- Auth: `/auth/register`, `/auth/login`
- Users: `/users/me`, `/users/me/avatar`
- Classes: `/classes`, `/classes/{id}/students`, removal
- Assignments: `/assignments`, `/assignments/{id}`
- Papers: generate, create, list, get, update question, submit, score update, student submissions, submission detail, delete cascade
- Documents: create folder, upload, list, get, download, delete
- Analytics: `/analytics/overview`, `/analytics/weak-skills`, `/analytics/student-performance`, `/analytics/weak-areas`, `/analytics/student-report`
- AI generator helpers: `_build_generation_options`, `_extract_json_block`

### Frontend (Next.js)
- Teacher analytics page rendering with mocked API
- Student report rendering with mocked API
- Smoke coverage across teacher/student pages
- Shared components: `Layout`, `Sidebar`, `ProfileSettings`

## Tests Run
### Backend
```
cd /Users/allmind/Desktop/Work/AI4School/backend
/usr/local/bin/python3 -m pytest
```

### Frontend
```
cd /Users/allmind/Desktop/Work/AI4School/frontend
npm test -- --runInBand
```

## Results
### Backend
```
21 passed, 4 warnings in 5.75s
```

### Frontend
```
22 passed in 1.35s (console warnings for act + Recharts sizing)
```

## Notes
- Backend warnings are from SQLAlchemy/Pydantic deprecations in existing code.
- Frontend warnings are from act() updates and Recharts container sizing in jsdom.
- AI generation and grading network calls are not exercised; only pure helper logic is unit tested.
