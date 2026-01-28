Frontend
========

Technology
----------
- Next.js (Pages Router)
- TypeScript + Tailwind CSS

Layout
------
Global layout and navigation live in:
- ``frontend/components/Layout.tsx``
- ``frontend/components/Sidebar.tsx``

Student Pages
-------------
- ``frontend/pages/student/home.tsx``: Dashboard
- ``frontend/pages/student/classroom.tsx``: Document list
- ``frontend/pages/student/paper/[id].tsx``: Exam interface (timer + answers)
- ``frontend/pages/student/submission/[id].tsx``: Review and scoring
- ``frontend/pages/student/report.tsx``: Progress report

Teacher Pages
-------------
- ``frontend/pages/teacher/documents.tsx``: Uploads and visibility
- ``frontend/pages/teacher/create-paper.tsx``: AI generation and editing
- ``frontend/pages/teacher/papers.tsx``: Assignments and paper list
- ``frontend/pages/teacher/classes.tsx``: Class roster
- ``frontend/pages/teacher/analytics.tsx``: Metrics dashboards
