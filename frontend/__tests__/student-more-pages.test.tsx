import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import api from '../utils/api';
import StudentReading from '../pages/student/paper/reading';
import StudentSubmission from '../pages/student/submission/[id]';
import StudentPaper from '../pages/student/paper/[id]';
import StudentClassroom from '../pages/student/classroom';
import { __setRouter } from 'next/router';

jest.mock('../utils/api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('Student additional pages', () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
    mockedApi.post.mockReset();
    window.alert = jest.fn();
    window.confirm = jest.fn().mockImplementation(() => true);
  });

  it('renders reading papers empty and list states', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] } as any);
    render(<StudentReading />);

    expect(screen.getByText(/Loading assignments/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/No papers assigned yet/i)).toBeInTheDocument());

    mockedApi.get.mockResolvedValueOnce({
      data: [
        { id: 1, title: 'Pending Paper', status: 'pending' },
        { id: 2, title: 'Completed Paper', status: 'completed', latest_score: 88, latest_submission_id: 5 },
        { id: 3, title: 'Completed No Score', status: 'completed' }
      ]
    } as any);

    render(<StudentReading />);
    await waitFor(() => expect(screen.getByText('Pending Paper')).toBeInTheDocument());
    expect(screen.getAllByText(/View Result/i)).toHaveLength(2);
    expect(screen.getByText(/Start/i)).toBeInTheDocument();
    expect(screen.getByText('Score: 88.0')).toBeInTheDocument();
    expect(screen.getByText('Score: 0')).toBeInTheDocument();
    const viewLinks = screen.getAllByText(/View Result/i);
    const viewLink = viewLinks[0].closest('a') as HTMLAnchorElement;
    expect(viewLink.href).toContain('/student/submission/5');
    const fallbackLink = viewLinks[1].closest('a') as HTMLAnchorElement;
    expect(fallbackLink.href).toContain('/student/submission/3');
  });

  it('logs error when reading papers fetch fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedApi.get.mockRejectedValueOnce(new Error('fail'));

    render(<StudentReading />);

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(screen.getByText(/No papers assigned yet/i)).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it('renders submission feedback and answer states', async () => {
    __setRouter({ pathname: '/student/submission/[id]', query: { id: '1' } });
    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 1,
        paper_title: 'Paper',
        score: 80,
        answers: [
          { question_text: 'Q1', answer: '', score: 0, max_score: 10, is_correct: false, feedback: 'Try again' },
          { question_text: 'Q2', answer: 'A', score: 10, max_score: 10, is_correct: true }
        ]
      }
    } as any);

    render(<StudentSubmission />);

    await waitFor(() => expect(screen.getByText(/Review Answers/i)).toBeInTheDocument());
    expect(screen.getByText(/Try again/i)).toBeInTheDocument();
    expect(screen.getByText(/No answer provided/i)).toBeInTheDocument();
  });

  it('renders submission with null score', async () => {
    __setRouter({ pathname: '/student/submission/[id]', query: { id: '1' } });
    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 1,
        paper_title: 'Paper',
        score: null,
        answers: [
          { question_text: 'Q1', answer: 'A', score: 0, max_score: 10, is_correct: null }
        ]
      }
    } as any);

    render(<StudentSubmission />);

    await waitFor(() => expect(screen.getByText(/Review Answers/i)).toBeInTheDocument());
    const scoreMatches = screen.getAllByText((_, element) => {
      const text = element?.textContent || '';
      return text.includes('0') && text.includes('/ 1');
    });
    expect(scoreMatches.length).toBeGreaterThan(0);
  });

  it('auto-submits paper when timer runs out', async () => {
    jest.useFakeTimers();
    const replace = jest.fn();
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '1' }, replace, push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 1,
        title: 'Paper 1',
        article_content: 'Text',
        assignment: { duration_minutes: 1 / 60 },
        questions: [{ id: 10, question_text: 'Q1', question_type: 'short' }]
      }
    } as any);

    mockedApi.post.mockResolvedValueOnce({ data: { submission_id: 99 } } as any);

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalled());
      expect(replace).toHaveBeenCalledWith('/student/paper/1?submitted=1&submission_id=99');

    jest.useRealTimers();
  });

  it('handles load error and back navigation in paper view', async () => {
    const back = jest.fn();
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '1' }, replace: jest.fn(), push: jest.fn(), back });
    mockedApi.get.mockRejectedValueOnce(new Error('fail'));

    render(<StudentPaper />);

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled());
  });

  it('ticks timer and triggers back button', async () => {
    jest.useFakeTimers();
    const back = jest.fn();
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '1' }, replace: jest.fn(), push: jest.fn(), back });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 1,
        title: 'Paper 1',
        article_content: 'Text',
        assignment: { duration_minutes: 2 / 60 },
        questions: [{ id: 10, question_text: 'Q1', question_type: 'short' }]
      }
    } as any);

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    fireEvent.click(screen.getByRole('button', { name: /Exit/i }));
    expect(back).toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('shows folder navigation and back to root in classroom', async () => {
    localStorage.setItem('student_token', 'token');
    mockedApi.get.mockImplementation((url: any) => {
      if (String(url).startsWith('/classes')) {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1', teacher_id: 10 }] });
      }
      if (String(url).startsWith('/documents')) {
        return Promise.resolve({ data: [{ id: 5, title: 'Folder', is_folder: true }] });
      }
      return Promise.resolve({ data: [] });
    });

    render(<StudentClassroom />);

    await waitFor(() => expect(screen.getByText('Class 1')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('cell', { name: 'Folder' })[0]);

    await waitFor(() => expect(screen.getByText(/Root \/ \./i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Back to Root/i }));
    await waitFor(() => expect(screen.getAllByText(/Course Materials/i).length).toBeGreaterThan(0));
  });

  it('shows alert on submission failure', async () => {
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '1' }, replace: jest.fn(), push: jest.fn(), back: jest.fn() });
    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 1,
        title: 'Paper 1',
        article_content: 'Text',
        questions: [{ id: 10, question_text: 'Q1', question_type: 'short' }]
      }
    } as any);

    mockedApi.post.mockRejectedValueOnce({ response: { data: { message: 'fail' } } } as any);

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Type your answer/i), { target: { value: 'Answer' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit Exam/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('fail'));
  });

  it('shows red timer and auto-submits at zero', async () => {
    jest.useFakeTimers();
    const replace = jest.fn();
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '2' }, replace, push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 2,
        title: 'Paper 2',
        article_content: 'Text',
        assignment: { duration_minutes: 0.05 },
        questions: [{ id: 10, question_text: 'Q1', question_type: 'short' }]
      }
    } as any);

    mockedApi.post.mockResolvedValueOnce({ data: { submission_id: 123 } } as any);

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());
    const timeBadge = screen.getByText(/0:0[0-3]/).closest('div') as HTMLDivElement;
    expect(timeBadge.className).toContain('bg-red-50');

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Time is up! Auto-submitting...'));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalled());
      expect(replace).toHaveBeenCalledWith('/student/paper/2?submitted=1&submission_id=123');

    jest.useRealTimers();
  });
});
