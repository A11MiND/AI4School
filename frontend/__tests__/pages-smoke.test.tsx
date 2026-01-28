import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import api from '../utils/api';
import Home from '../pages/index';
import TeacherHome from '../pages/teacher/home';
import TeacherLogin from '../pages/teacher/login';
import TeacherClasses from '../pages/teacher/classes';
import TeacherClassDetail from '../pages/teacher/class/[id]';
import TeacherDocuments from '../pages/teacher/documents';
import TeacherPapers from '../pages/teacher/papers';
import TeacherPaperDetail from '../pages/teacher/paper/[id]';
import TeacherReading from '../pages/teacher/paper/reading';
import TeacherListening from '../pages/teacher/paper/listening';
import TeacherWriting from '../pages/teacher/paper/writing';
import TeacherSpeaking from '../pages/teacher/paper/speaking';
import TeacherCreatePaper from '../pages/teacher/create-paper';
import TeacherSettings from '../pages/teacher/settings';
import TeacherGrading from '../pages/teacher/grading/[id]';
import StudentLogin from '../pages/student/login';
import StudentRegister from '../pages/student/register';
import StudentHome from '../pages/student/home';
import StudentClassroom from '../pages/student/classroom';
import StudentPaper from '../pages/student/paper/[id]';
import StudentReading from '../pages/student/paper/reading';
import StudentSubmission from '../pages/student/submission/[id]';
import StudentReport from '../pages/student/report';
import StudentSettings from '../pages/student/settings';
import { __setRouter } from 'next/router';

jest.mock('../utils/api');

const mockedApi = api as jest.Mocked<typeof api>;

const mockGet = (url: string) => {
  if (url.startsWith('/classes')) return Promise.resolve({ data: [] });
  if (url.startsWith('/documents')) return Promise.resolve({ data: [] });
  if (url.startsWith('/papers/submissions/')) {
    return Promise.resolve({
      data: { paper_title: 'Paper', student_name: 'Student', score: 80, answers: [] }
    });
  }
  if (url.startsWith('/papers/students/')) return Promise.resolve({ data: [] });
  if (url === '/papers/' || url.startsWith('/papers?')) {
    return Promise.resolve({
      data: []
    });
  }
  if (url.startsWith('/papers/')) {
    return Promise.resolve({
      data: {
        id: 1,
        title: 'Paper',
        article_content: 'Text',
        questions: [],
        assignment: null,
        submission: null,
      },
    });
  }
  if (url.startsWith('/analytics/overview')) {
    return Promise.resolve({ data: { total_submissions: 0, average_score: 0, active_students: 0 } });
  }
  if (url.startsWith('/analytics/weak-skills')) return Promise.resolve({ data: [] });
  if (url.startsWith('/analytics/student-performance')) return Promise.resolve({ data: [] });
  if (url.startsWith('/analytics/weak-areas')) {
    return Promise.resolve({ data: { skills: [], question_types: [], papers: [], students: [] } });
  }
  if (url.startsWith('/analytics/student-report')) {
    return Promise.resolve({
      data: {
        overview: { average_score: 0, total_submissions: 0, latest_score: null },
        trend: [],
        weak_skills: [],
        skill_accuracy: [],
        type_accuracy: [],
        recent: [],
        summary: 'No submissions yet. Complete a paper to see your progress.'
      }
    });
  }
  if (url.startsWith('/users/me')) return Promise.resolve({ data: { username: 'user', role: 'teacher' } });
  if (url.startsWith('/assignments/paper/')) return Promise.resolve({ data: [] });
  if (url.startsWith('/assignments')) return Promise.resolve({ data: [] });
  return Promise.resolve({ data: [] });
};

beforeEach(() => {
  mockedApi.get.mockImplementation((url: any) => mockGet(String(url)) as any);
  mockedApi.post.mockResolvedValue({ data: {} } as any);
  mockedApi.put.mockResolvedValue({ data: {} } as any);
  mockedApi.delete.mockResolvedValue({ data: {} } as any);
});

describe('Page smoke tests', () => {
  it('renders landing page', () => {
    render(<Home />);
    expect(screen.getAllByText(/AI4School/i).length).toBeGreaterThan(0);
  });

  it('renders teacher home', () => {
    render(<TeacherHome />);
    expect(screen.getByText(/Teacher Dashboard/i)).toBeInTheDocument();
  });

  it('renders teacher login', () => {
    render(<TeacherLogin />);
    expect(screen.getByText(/Teacher Portal/i)).toBeInTheDocument();
  });

  it('renders teacher classes', async () => {
    render(<TeacherClasses />);
    await waitFor(() => expect(screen.getByText(/My Classes/i)).toBeInTheDocument());
  });

  it('renders teacher class detail', async () => {
    __setRouter({ query: { id: '1' }, pathname: '/teacher/class/[id]' });
    render(<TeacherClassDetail />);
    await waitFor(() => expect(screen.getByText(/Class Management/i)).toBeInTheDocument());
  });

  it('renders teacher documents', async () => {
    render(<TeacherDocuments />);
    await waitFor(() => expect(screen.getByText(/Content Library/i)).toBeInTheDocument());
  });

  it('renders teacher papers list', async () => {
    render(<TeacherPapers />);
    await waitFor(() => expect(screen.getByText(/My Papers/i)).toBeInTheDocument());
  });

  it('renders teacher paper detail', async () => {
    __setRouter({ query: { id: '1' }, pathname: '/teacher/paper/[id]' });
    render(<TeacherPaperDetail />);
    await waitFor(() => expect(screen.getByText(/Paper ID/i)).toBeInTheDocument());
  });

  it('renders teacher paper skills pages', () => {
    render(<TeacherReading />);
    render(<TeacherListening />);
    render(<TeacherWriting />);
    render(<TeacherSpeaking />);
    expect(screen.getAllByText(/Manage Reading Papers|Listening Papers|Writing Papers|Speaking Papers/i).length).toBeGreaterThan(0);
  });

  it('renders teacher create paper', () => {
    render(<TeacherCreatePaper />);
    expect(screen.getByText(/Source Material/i)).toBeInTheDocument();
  });

  it('renders teacher settings', async () => {
    render(<TeacherSettings />);
    expect(screen.getByText(/Loading profile/i)).toBeInTheDocument();
  });

  it('renders teacher grading', async () => {
    __setRouter({ query: { id: '1' }, pathname: '/teacher/grading/[id]' });
    render(<TeacherGrading />);
    await waitFor(() => expect(screen.getByText(/Grading/i)).toBeInTheDocument());
  });

  it('renders student login and register', () => {
    render(<StudentLogin />);
    render(<StudentRegister />);
    expect(screen.getByText(/Student Portal/i)).toBeInTheDocument();
    expect(screen.getByText(/Student Registration/i)).toBeInTheDocument();
  });

  it('renders student home and classroom', () => {
    render(<StudentHome />);
    render(<StudentClassroom />);
    expect(screen.getByText(/Student Dashboard/i)).toBeInTheDocument();
  });

  it('renders student paper and submission', async () => {
    __setRouter({ query: { id: '1' }, pathname: '/student/paper/[id]' });
    render(<StudentPaper />);
    await waitFor(() => expect(screen.getByText(/Answer the questions carefully/i)).toBeInTheDocument());

    __setRouter({ query: { id: '1' }, pathname: '/student/submission/[id]' });
    render(<StudentSubmission />);
    await waitFor(() => expect(screen.getByText(/Review Answers/i)).toBeInTheDocument());
  });

  it('renders student reading practice, report, and settings', async () => {
    render(<StudentReading />);
    render(<StudentReport />);
    render(<StudentSettings />);
    await waitFor(() => expect(screen.getByText(/Learning Report/i)).toBeInTheDocument());
  });
});
