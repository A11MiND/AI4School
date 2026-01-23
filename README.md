<div align="center">
  <img src="AI4School_icon.png" alt="AI4School Logo" width="150" height="150">
  <h1>AI4School Project Documentation</h1>
</div>

## Project Overview
AI4School is a comprehensive educational platform designed to streamline the workflow between teachers and students. It features an automated exam content generation system using AI, a complete class management system, and an interactive student portal for taking exams and reviewing performance.

### Tech Stack
- **Frontend**: Next.js (React), TypeScript, Tailwind CSS, Lucide React (Icons)
- **Backend**: Python FastAPI, SQLAlchemy, DeepSeek V3 (AI Integration)
- **Database**: SQLite (Development), extensible to PostgreSQL
- **Authentication**: JWT (JSON Web Tokens) with Role-Based Access Control (RBAC)

---

## 1. Backend Structure (`/backend`)
The backend is built with FastAPI and follows a modular MVC-like structure.

### Core Application (`backend/app/`)
*   **`main.py`**: The entry point of the FastAPI application. It configures CORS, initializes the database tables headers, and includes all routers.
*   **`database.py`**: Handles database connection via SQLAlchemy. Sets up the `SessionLocal` and `Base` model class.

### Models (`backend/app/models/`)
Defines the database schema (tables).
*   **`user.py`**: User table for both Teachers and Students (stores hashed passwords, roles).
*   **`class_model.py`**: Groups students into classes, managed by teachers.
*   **`document.py`**: Stores raw reference materials (PDFs/Text) uploaded by teachers.
*   **`paper.py`**: Represents an generated assignment/exam paper.
*   **`question.py`**: Questions linked to a Paper (MCQ or Open-ended).
*   **`assignment.py`**: Links a `Paper` to a `Class` with a deadline and duration.
*   **`submission.py`**: Stores student answers and grading results.
*   **`student_association.py`**: Many-to-Many link table between Students and Classes.

### Routers (`backend/app/routers/`)
API Endpoints grouped by feature.
*   **`auth.py`**: Handles User Login (`/token`) and Registration (`/users/`).
*   **`documents.py`**: CRUD operations for uploading/managing raw course materials.
*   **`papers.py`**: 
    - AI Generation endpoint (`/generate`)
    - Paper creation, retrieval, and deletion.
    - Creating and grading Submissions (`/submissions`).
*   **`classes.py`**: Managing classes and adding/removing students.
*   **`assignments.py`**: Assigning papers to classes and revoking them.

### Services (`backend/app/services/`)
*   **`ai_generator.py`**: Connects to the DeepSeek AI API to generate educational questions based on provided text content.

### Root Utilities
*   **`seed.py`**: A script to populate the database with initial dummy data (admin user, test classes).
*   **`init_admin.py`**: Helper to create an admin account manually.

---

## 2. Frontend Structure (`/frontend`)
The frontend is a Next.js application using Pages Router and Tailwind CSS.

### Pages (`frontend/pages/`)
*   **`_app.tsx`**: Global wrapper. Handles global styles and layout application (except for login pages).
*   **`index.tsx`**: The landing page giving users the choice to login as Student or Teacher.

#### Student Portal (`frontend/pages/student/`)
*   **`login.tsx`**: Student login interface. Saves tokens to `student_token`.
*   **`home.tsx`**: **Student Dashboard**. Shows "To Do" assignments and recent results.
*   **`classroom.tsx`**: Static view for class materials (placeholder).
*   **`paper/[id].tsx`**: **Exam Interface**. The actual "Take Paper" screen with timer and questions.
*   **`submission/[id].tsx`**: **Result View**. Shows the score, correct answers, and feedback after submission.
*   **`report.tsx`**: Visual progress report for the student.

#### Teacher Portal (`frontend/pages/teacher/`)
*   **`login.tsx`**: Teacher login interface. Saves tokens to `teacher_token`.
*   **`home.tsx`**: **Teacher Dashboard**. Quick links to create papers, view classes, and system status.
*   **`documents.tsx`**: Upload and manage raw source materials (PDFs/Text).
*   **`create-paper.tsx`**: **AI Generator**. 
    - Select source material -> Generate Questions (AI) -> Edit/Review -> Publish.
    - Also handles "Editing" existing papers.
*   **`papers.tsx`**: List of all created papers with options to **Assign** to classes or **Edit**.
*   **`classes.tsx`**: List of classes managed by the teacher.
*   **`class/[id].tsx`**: **Class Detail View**.
    - Manage Student Roster (Add/Remove).
    - View Submission history per student.
*   **`grading/[id].tsx`**: **Grading Interface**. View a specific student's submission and manually adjust scores.

### Components (`frontend/components/`)
*   **`Sidebar.tsx`**: The main navigation bar. It is **Context Aware**, showing different links for Students vs Teachers, and handling distinct logout flows.
*   **`Layout.tsx`**: Wraps the main content with the Sidebar.

### Utilities (`frontend/utils/`)
*   **`api.ts`**: The Axios instance configuration.
    - **Context-Aware Tokens**: Automatically switches between `student_token` and `teacher_token` based on the URL path (`/student` vs `/teacher`) to allow concurrent sessions.
    - **Interceptors**: Handles auto-logout on 401 errors.

---

## Key Workflows

### 1. Paper Creation Flow (Teacher)
1.  **Upload**: Teacher uploads a text/PDF in `documents.tsx`.
2.  **Generate**: Clicks "Make Paper", goes to `create-paper.tsx`.
3.  **AI Process**: `ai_generator.py` calls DeepSeek to create questions.
4.  **Edit/Publish**: Teacher reviews questions, edits if needed, and publishes to DB.

### 2. Assignment Flow
1.  **Assign**: In `papers.tsx`, Teacher clicks "Assign", selects a Class, Deadline, and Duration.
2.  **Student View**: Student logs in (`home.tsx`) and sees the new assignment in "To Do".

### 3. Exam & Grading Flow
1.  **Take Exam**: Student opens paper (`paper/[id].tsx`). Timer counts down.
2.  **Submit**: Answers sent to `papers.py` -> `submit_paper`.
3.  **Auto-Grade**: Backend compares MCQ answers instantly.
4.  **Review**: Student sees score immediately (`submission/[id].tsx`).
5.  **Teacher Review**: Teacher sees submission in `class/[id].tsx` and details in `grading/[id].tsx`.
