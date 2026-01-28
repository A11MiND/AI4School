import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AnalyticsDashboard, { getQuestionTypeLabel, sortWeakAreaStudents } from '../pages/teacher/analytics';
import api from '../utils/api';

jest.mock('../utils/api');
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    query: {},
  }),
}));

const mockedApi = api as jest.Mocked<typeof api>;

describe('AnalyticsDashboard', () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
  });

  it('renders class filter and weak areas', async () => {
    mockedApi.get.mockImplementation((url) => {
      if (url === '/classes') {
        return Promise.resolve({ data: [{ id: 1, name: 'Class A' }] });
      }
      if (url === '/analytics/overview') {
        return Promise.resolve({ data: { total_submissions: 3, average_score: 72.5, active_students: 2 } });
      }
      if (url === '/analytics/weak-skills') {
        return Promise.resolve({ data: [{ skill: 'Inference', errors: 4 }] });
      }
      if (url === '/analytics/student-performance') {
        return Promise.resolve({ data: [{ student: 'Alice', average_score: 55, exams_taken: 2 }] });
      }
      if (url === '/analytics/weak-areas') {
        return Promise.resolve({
          data: {
            skills: [{ skill: 'Inference', errors: 4, accuracy: 50, total: 8 }],
            question_types: [{ question_type: 'mcq', errors: 3, accuracy: 60, total: 5 }],
            papers: [{ paper_id: 1, title: 'Paper A', average_score: 60, submissions: 2 }],
            students: [{ student: 'Alice', average_score: 55, exams_taken: 2, weak_skills: [{ skill: 'Inference', errors: 3, accuracy: 40, total: 5 }] }]
          }
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Class Performance Analytics')).toBeInTheDocument();
      expect(screen.getByText('Class')).toBeInTheDocument();
      expect(screen.getByText('Weak Question Types')).toBeInTheDocument();
      expect(screen.getByText('Lowest Performing Papers')).toBeInTheDocument();
      expect(screen.getByText('Multiple Choice')).toBeInTheDocument();
    });
  });

  it('renders empty states when no analytics data', async () => {
    mockedApi.get.mockImplementation((url) => {
      if (url === '/classes') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/overview') {
        return Promise.resolve({ data: { total_submissions: 0, average_score: 0, active_students: 0 } });
      }
      if (url === '/analytics/weak-skills') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/student-performance') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/weak-areas') {
        return Promise.resolve({ data: { skills: [], question_types: [], papers: [], students: [] } });
      }
      return Promise.resolve({ data: [] });
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/No error data available yet/i)).toBeInTheDocument();
      expect(screen.getByText(/No student data available/i)).toBeInTheDocument();
      expect(screen.getByText(/No question-type data yet/i)).toBeInTheDocument();
      expect(screen.getByText(/No paper data yet/i)).toBeInTheDocument();
    });
  });

  it('handles null class response', async () => {
    mockedApi.get.mockImplementation((url) => {
      if (url === '/classes') {
        return Promise.resolve({ data: null });
      }
      if (url === '/analytics/overview') {
        return Promise.resolve({ data: { total_submissions: 0, average_score: 0, active_students: 0 } });
      }
      if (url === '/analytics/weak-skills') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/student-performance') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/weak-areas') {
        return Promise.resolve({ data: { skills: [], question_types: [], papers: [], students: [] } });
      }
      return Promise.resolve({ data: [] });
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText('All Classes')).toBeInTheDocument());
    expect(screen.queryByText('Class A')).not.toBeInTheDocument();
  });

  it('updates sorting and shows unknown question type label', async () => {
    mockedApi.get.mockImplementation((url) => {
      if (url === '/classes') {
        return Promise.resolve({ data: [{ id: 1, name: 'Class A' }] });
      }
      if (url === '/analytics/overview') {
        return Promise.resolve({ data: { total_submissions: 3, average_score: 72.5, active_students: 2 } });
      }
      if (url === '/analytics/weak-skills') {
        return Promise.resolve({ data: [{ skill: 'Inference', errors: 4 }, { skill: 'Detail', errors: 1 }] });
      }
      if (url === '/analytics/student-performance') {
        return Promise.resolve({ data: [{ student: 'Alice', average_score: 55, exams_taken: 2 }, { student: 'Bob', average_score: 90, exams_taken: 5 }] });
      }
      if (url === '/analytics/weak-areas') {
        return Promise.resolve({
          data: {
            skills: [{ skill: 'Inference', errors: 4, accuracy: 50, total: 8 }],
            question_types: [{ question_type: '', errors: 3, accuracy: 60, total: 5 }],
            papers: [{ paper_id: 1, title: 'Paper A', average_score: 60, submissions: 2 }],
            students: [{ student: 'Alice', average_score: 55, exams_taken: 2, weak_skills: [] }]
          }
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText('Students Needing Attention')).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue('Most errors first'), { target: { value: 'errors_asc' } });
    fireEvent.change(screen.getByDisplayValue('Lowest avg first'), { target: { value: 'avg_desc' } });
    fireEvent.change(screen.getByDisplayValue('Highest avg first'), { target: { value: 'exams_desc' } });

    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('filters analytics by class selection', async () => {
    mockedApi.get.mockImplementation((url, config) => {
      if (url === '/classes') {
        return Promise.resolve({ data: [{ id: 1, name: 'Class A' }] });
      }
      if (url === '/analytics/overview') {
        return Promise.resolve({ data: { total_submissions: 1, average_score: 70, active_students: 1 } });
      }
      if (url === '/analytics/weak-skills') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/student-performance') {
        return Promise.resolve({
          data: [
            { student: 'Alice', average_score: 55, exams_taken: 1 },
            { student: 'Bob', average_score: 80, exams_taken: 4 }
          ]
        });
      }
      if (url === '/analytics/weak-areas') {
        return Promise.resolve({ data: { skills: [], question_types: [], papers: [], students: [] } });
      }
      return Promise.resolve({ data: [] });
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText('Class Performance Analytics')).toBeInTheDocument());
    const classSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(classSelect, { target: { value: '1' } });

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/analytics/overview', { params: { class_id: '1' } }));
  });

  it('logs class fetch failure', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedApi.get.mockImplementation((url) => {
      if (url === '/classes') {
        return Promise.reject(new Error('fail'));
      }
      if (url === '/analytics/overview') {
        return Promise.resolve({ data: { total_submissions: 0, average_score: 0, active_students: 0 } });
      }
      if (url === '/analytics/weak-skills') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/student-performance') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/weak-areas') {
        return Promise.resolve({ data: { skills: [], question_types: [], papers: [], students: [] } });
      }
      return Promise.resolve({ data: [] });
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    errorSpy.mockRestore();
  });

  it('logs analytics fetch failure', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedApi.get.mockImplementation((url) => {
      if (url === '/classes') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/overview') {
        return Promise.reject(new Error('fail'));
      }
      if (url === '/analytics/weak-skills') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/student-performance') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/weak-areas') {
        return Promise.resolve({
          data: {
            skills: [],
            question_types: [],
            papers: [],
            students: []
          }
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    errorSpy.mockRestore();
  });

  it('sorts weak areas by exams', async () => {
    mockedApi.get.mockImplementation((url) => {
      if (url === '/classes') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/overview') {
        return Promise.resolve({ data: { total_submissions: 1, average_score: 70, active_students: 1 } });
      }
      if (url === '/analytics/weak-skills') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/student-performance') {
        return Promise.resolve({
          data: [
            { student: 'Alice', average_score: null, exams_taken: null },
            { student: 'Bob', average_score: 80, exams_taken: 4 }
          ]
        });
      }
      if (url === '/analytics/weak-areas') {
        return Promise.resolve({
          data: {
            skills: [],
            question_types: [],
            papers: [],
            students: [
              { student: 'Alice', average_score: null, exams_taken: null, weak_skills: [] },
              { student: 'Bob', average_score: 80, exams_taken: 4, weak_skills: [] }
            ]
          }
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText('Students Needing Attention')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('Lowest avg first'), { target: { value: 'exams_desc' } });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders weak skills for students and sorts by exams/avg', async () => {
    mockedApi.get.mockImplementation((url) => {
      if (url === '/classes') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/overview') {
        return Promise.resolve({ data: { total_submissions: 2, average_score: 75, active_students: 2 } });
      }
      if (url === '/analytics/weak-skills') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/analytics/student-performance') {
        return Promise.resolve({
          data: [
            { student: 'Alice', average_score: null, exams_taken: null },
            { student: 'Bob', average_score: 80, exams_taken: 4 }
          ]
        });
      }
      if (url === '/analytics/weak-areas') {
        return Promise.resolve({
          data: {
            skills: [],
            question_types: [{ question_type: 'MCQ', errors: 2, accuracy: 80, total: 5 }],
            papers: [],
            students: [
              { student: 'Alice', average_score: null, exams_taken: null, weak_skills: [{ skill: 'Inference', errors: 2, accuracy: 50, total: 4 }] },
              { student: 'Bob', average_score: 80, exams_taken: 4, weak_skills: [{ skill: 'Detail', errors: 1, accuracy: 80, total: 5 }] }
            ]
          }
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => expect(screen.getByText('Students Needing Attention')).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue('Lowest avg first'), { target: { value: 'avg_desc' } });
    fireEvent.change(screen.getByDisplayValue('Highest avg first'), { target: { value: 'exams_desc' } });

    await waitFor(() => {
      const rows = screen.getAllByRole('row').slice(1);
      expect(rows[0]).toHaveTextContent('Bob');
    });

    expect(screen.getByText('Inference')).toBeInTheDocument();
    expect(screen.getByText('Detail')).toBeInTheDocument();
    expect(screen.getByText('Multiple Choice')).toBeInTheDocument();
  });

  it('sortWeakAreaStudents handles avg and exams sorting', () => {
    const students = [
      { student: 'Alice', average_score: null, exams_taken: 1 },
      { student: 'Bob', average_score: 80, exams_taken: 4 },
      { student: 'Cara', average_score: 90, exams_taken: 2 }
    ];

    const avgDesc = sortWeakAreaStudents(students as any, 'avg_desc');
    expect(avgDesc[0].student).toBe('Cara');

    const examsDesc = sortWeakAreaStudents(students as any, 'exams_desc');
    expect(examsDesc[0].student).toBe('Bob');
  });

  it('getQuestionTypeLabel maps known and unknown types', () => {
    expect(getQuestionTypeLabel('MCQ')).toBe('Multiple Choice');
    expect(getQuestionTypeLabel('')).toBe('Unknown');
  });
});
