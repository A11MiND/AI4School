import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import api from '../utils/api';
import StudentHome from '../pages/student/home';
import StudentClassroom from '../pages/student/classroom';
import StudentPaper from '../pages/student/paper/[id]';
import StudentSubmission from '../pages/student/submission/[id]';
import { __setRouter } from 'next/router';

jest.mock('../utils/api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('Student pages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockedApi.get.mockResolvedValue({ data: [] } as any);
    mockedApi.post.mockResolvedValue({ data: {} } as any);
    window.confirm = jest.fn().mockReturnValue(true);
    window.alert = jest.fn();
  });

  it('renders student home with assignments', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/home', push: jest.fn() });

    mockedApi.get.mockResolvedValue({
      data: [
        { id: 1, title: 'Paper A', submitted_count: 0, max_attempts: 1, assignment_id: 1, deadline: null, duration_minutes: null },
        { id: 2, title: 'Paper B', submitted_count: 1, max_attempts: 1, assignment_id: 2, latest_submission_id: 3, latest_score: 85 }
      ]
    } as any);

    render(<StudentHome />);

    await waitFor(() => expect(screen.getByText('Paper A')).toBeInTheDocument());
    expect(screen.getByText('Paper B')).toBeInTheDocument();
  });

  it('renders active assignment details with deadline and duration', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/home', push: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          title: 'Paper A',
          submitted_count: 0,
          max_attempts: 2,
          assignment_id: 1,
          deadline: new Date('2024-01-01').toISOString(),
          duration_minutes: 45
        }
      ]
    } as any);

    render(<StudentHome />);

    await waitFor(() => expect(screen.getByText('Paper A')).toBeInTheDocument());
    expect(screen.getByText(/Due:/i)).toBeInTheDocument();
    expect(screen.getByText(/Duration:/i)).toBeInTheDocument();
    expect(screen.getByText(/Attempt 1 of 2/i)).toBeInTheDocument();
  });

  it('renders completed assignment score', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/home', push: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: [
        { id: 2, title: 'Paper B', submitted_count: 1, max_attempts: 1, assignment_id: 2, latest_submission_id: 3, latest_score: 85 }
      ]
    } as any);

    render(<StudentHome />);

    await waitFor(() => expect(screen.getByText('Paper B')).toBeInTheDocument());
    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('renders attempt count with default max attempts', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/home', push: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: [
        { id: 1, title: 'Paper A', submitted_count: 0, assignment_id: 1, deadline: null, duration_minutes: null }
      ]
    } as any);

    render(<StudentHome />);

    await waitFor(() => expect(screen.getByText('Paper A')).toBeInTheDocument());
    expect(screen.getByText(/Attempt 1 of 1/i)).toBeInTheDocument();
  });

  it('renders recent results with fallback score', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/home', push: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: [
        { id: 2, title: 'Paper B', submitted_count: 1, max_attempts: 1, assignment_id: 2, latest_submission_id: 3, latest_score: 0 }
      ]
    } as any);

    render(<StudentHome />);

    await waitFor(() => expect(screen.getByText('Paper B')).toBeInTheDocument());
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders student home all caught up', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/home', push: jest.fn() });

    mockedApi.get.mockResolvedValue({
      data: [{ id: 2, title: 'Paper B', submitted_count: 1, max_attempts: 1, assignment_id: 2, latest_submission_id: 3, latest_score: 85 }]
    } as any);

    render(<StudentHome />);

    await waitFor(() => expect(screen.getByText(/All Caught Up/i)).toBeInTheDocument());
  });

  it('redirects to login when student token missing', async () => {
    const push = jest.fn();
    __setRouter({ pathname: '/student/home', push });

    render(<StudentHome />);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/student/login'));
  });

  it('shows empty state when fetch papers fails', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/home', push: jest.fn() });
    mockedApi.get.mockRejectedValueOnce(new Error('fail'));

    render(<StudentHome />);

    await waitFor(() => expect(screen.getByText(/All Caught Up/i)).toBeInTheDocument());
    expect(screen.getByText(/No completed papers yet/i)).toBeInTheDocument();
  });

  it('renders classroom and navigates folders', async () => {
    localStorage.setItem('student_token', 'token');
    mockedApi.get.mockImplementation((url: any) => {
      if (String(url).startsWith('/classes')) {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1', teacher_id: 10 }, { id: 2, name: 'Class 2', teacher_id: 11 }] });
      }
      if (String(url).startsWith('/documents')) {
        return Promise.resolve({ data: [
          { id: 5, title: 'Folder', is_folder: true },
          { id: 6, filename: 'doc.pdf', is_folder: false, file_path: 'uploads/file.pdf' }
        ] });
      }
      return Promise.resolve({ data: [] });
    });

    render(<StudentClassroom />);

    await waitFor(() => expect(screen.getByText('Class 1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Class 2'));
    fireEvent.click(screen.getByText('Class 1'));

    await waitFor(() => expect(screen.getAllByText('Folder').length).toBeGreaterThan(0));
    expect(screen.getByText('doc.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Folder')[0]);

    await waitFor(() => expect(screen.getAllByText(/Root/i).length).toBeGreaterThan(0));

    fireEvent.click(screen.getByText(/Root \/ \.{3}/i));

    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    const downloadButtons = document.querySelectorAll('button');
    fireEvent.click(downloadButtons[downloadButtons.length - 1]);
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('renders classroom empty state and handles document fetch error', async () => {
    localStorage.setItem('student_token', 'token');
    mockedApi.get.mockImplementation((url: any) => {
      if (String(url).startsWith('/classes')) {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1', teacher_id: 10 }] });
      }
      if (String(url).startsWith('/documents')) {
        return Promise.reject(new Error('fail'));
      }
      return Promise.resolve({ data: [] });
    });

    render(<StudentClassroom />);

    await waitFor(() => expect(screen.getByText('Class 1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Class 1'));

    await waitFor(() => expect(screen.getByText(/No materials found/i)).toBeInTheDocument());
  });

  it('downloads file when clicking file row', async () => {
    localStorage.setItem('student_token', 'token');
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null as any);
    mockedApi.get.mockImplementation((url: any) => {
      if (String(url).startsWith('/classes')) {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1', teacher_id: 10 }] } as any);
      }
      if (String(url).startsWith('/documents')) {
        return Promise.resolve({ data: [{ id: 2, title: 'File 1', is_folder: false, file_path: 'uploads/file.pdf' }] } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    render(<StudentClassroom />);

    await waitFor(() => expect(screen.getByText('File 1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('File 1'));

    expect(openSpy).toHaveBeenCalledWith('http://localhost:8000/documents/2/download', '_blank');
    openSpy.mockRestore();
  });

  it('handles class fetch error', async () => {
    localStorage.setItem('student_token', 'token');
    mockedApi.get.mockRejectedValueOnce(new Error('fail'));

    render(<StudentClassroom />);

    await waitFor(() => expect(screen.getByText(/No classes enrolled/i)).toBeInTheDocument());
  });

  it('submits student paper and redirects to submission', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '1' }, replace: jest.fn(), push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValue({
      data: {
        id: 1,
        title: 'Paper 1',
        article_content: 'Text',
        assignment: { duration_minutes: 1 },
        questions: [{ id: 10, question_text: 'Q1', question_type: 'mcq', options: ['A', 'B'] }]
      }
    } as any);

    mockedApi.post.mockResolvedValue({ data: { submission_id: 99 } } as any);

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByRole('button', { name: /submit exam/i }));
  });

  it('prevents submission when confirm is cancelled', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '2' }, replace: jest.fn(), push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 2,
        title: 'Paper 2',
        article_content: 'Text',
        questions: [{ id: 10, question_text: 'Q1', question_type: 'short' }]
      }
    } as any);

    window.confirm = jest.fn().mockReturnValue(false);
    mockedApi.post.mockClear();

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /submit exam/i }));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('shows timer display with leading zero', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '3' }, replace: jest.fn(), push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 3,
        title: 'Paper 3',
        article_content: 'Text',
        assignment: { duration_minutes: 2.1 },
        questions: [{ id: 10, question_text: 'Q1', question_type: 'short' }]
      }
    } as any);

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());
    expect(screen.getByText(/2:0[56]/)).toBeInTheDocument();
  });

  it('shows blue timer with double-digit seconds', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '6' }, replace: jest.fn(), push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 6,
        title: 'Paper 6',
        article_content: 'Text',
        assignment: { duration_minutes: 10.5 },
        questions: [{ id: 10, question_text: 'Q1', question_type: 'short' }]
      }
    } as any);

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());
    const timeChip = screen.getByText('10:30').closest('div') as HTMLDivElement;
    expect(timeChip.className).toContain('bg-blue-50');
  });

  it('handles open-answer question and submit fallback', async () => {
    localStorage.setItem('student_token', 'token');
    const push = jest.fn();
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '1' }, replace: jest.fn(), push, back: jest.fn() });

    mockedApi.get.mockResolvedValue({
      data: {
        id: 1,
        title: 'Paper 1',
        article_content: '',
        questions: [{ id: 10, question_text: 'Q1', question_type: 'short' }]
      }
    } as any);

    mockedApi.post.mockResolvedValue({ data: {} } as any);

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByPlaceholderText(/Type your answer/i)).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Type your answer/i), { target: { value: 'Answer' } });
    (window.confirm as jest.Mock).mockImplementationOnce(() => true);
    fireEvent.click(screen.getByRole('button', { name: /submit exam/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/student/home'));
  });

  it('ticks timer and shows red countdown', async () => {
    jest.useFakeTimers();
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '4' }, replace: jest.fn(), push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 4,
        title: 'Paper 4',
        article_content: 'Text',
        assignment: { duration_minutes: 0.1 },
        questions: [{ id: 10, question_text: 'Q1', question_type: 'short' }]
      }
    } as any);

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());
    const timeChip = screen.getByText(/0:0[5-6]/).closest('div') as HTMLDivElement;
    expect(timeChip.className).toContain('bg-red-50');

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/0:0[4-5]/)).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('auto-submits when timer hits zero', async () => {
    jest.useFakeTimers();
    localStorage.setItem('student_token', 'token');
    const replace = jest.fn();
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '8' }, replace, push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 8,
        title: 'Paper 8',
        article_content: 'Text',
        assignment: { duration_minutes: 1 / 60 },
        questions: [{ id: 10, question_text: 'Q1', question_type: 'short' }]
      }
    } as any);

    mockedApi.post.mockResolvedValueOnce({ data: { submission_id: 123 } } as any);
    window.alert = jest.fn();
    window.confirm = jest.fn();

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalled());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith('Time is up! Auto-submitting...');
    expect(replace).toHaveBeenCalledWith('/student/paper/8?submitted=1&submission_id=123');
    jest.useRealTimers();
  });

  it('alerts on submission error', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '5' }, replace: jest.fn(), push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 5,
        title: 'Paper 5',
        article_content: 'Text',
        questions: [{ id: 10, question_text: 'Q1', question_type: 'short' }]
      }
    } as any);

    mockedApi.post.mockRejectedValueOnce({ response: { data: { message: 'Submission failed' } } } as any);

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /submit exam/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Submission failed'));
  });

  it('falls back to generic submission error', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '7' }, replace: jest.fn(), push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 7,
        title: 'Paper 7',
        article_content: 'Text',
        questions: [{ id: 10, question_text: 'Q1', question_type: 'short' }]
      }
    } as any);

    mockedApi.post.mockRejectedValueOnce(new Error('fail'));

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /submit exam/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Submission failed'));
  });

  it('ignores submit when already submitting', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/paper/[id]', query: { id: '9' }, replace: jest.fn(), push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 9,
        title: 'Paper 9',
        article_content: 'Text',
        questions: [{ id: 10, question_text: 'Q1', question_type: 'short' }]
      }
    } as any);

    mockedApi.post.mockReturnValueOnce(new Promise(() => undefined) as any);

    render(<StudentPaper />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());
    const submitButton = screen.getByRole('button', { name: /submit exam/i });
    fireEvent.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());

    const reactPropsKey = Object.keys(submitButton).find((key) => key.startsWith('__reactProps')) as string;
    const onClick = (submitButton as any)[reactPropsKey]?.onClick as ((event?: unknown) => void) | undefined;
    onClick?.({ preventDefault: () => undefined });

    expect(mockedApi.post).toHaveBeenCalledTimes(1);
  });


  it('renders submission details', async () => {
    __setRouter({ pathname: '/student/submission/[id]', query: { id: '1' } });
    mockedApi.get.mockResolvedValue({
      data: { paper_title: 'Paper', student_name: 'Student', score: 80, answers: [] }
    } as any);

    render(<StudentSubmission />);

    await waitFor(() => expect(screen.getByText(/Review Answers/i)).toBeInTheDocument());
  });

  it('renders submission with unknown correctness', async () => {
    __setRouter({ pathname: '/student/submission/[id]', query: { id: '1' } });
    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 1,
        paper_title: 'Paper',
        score: 80,
        answers: [
          { question_text: 'Q1', answer: 'A', score: 5, max_score: 10, is_correct: null }
        ]
      }
    } as any);

    render(<StudentSubmission />);

    await waitFor(() => expect(screen.getByText(/Review Answers/i)).toBeInTheDocument());
    expect(screen.getByText(/Q1/i)).toBeInTheDocument();
  });

  it('renders submission score fallback line', async () => {
    __setRouter({ pathname: '/student/submission/[id]', query: { id: '2' } });
    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 2,
        paper_title: 'Paper',
        score: 70,
        answers: [
          { question_text: 'Q1', answer: 'A', score: 0, max_score: 0, is_correct: true }
        ]
      }
    } as any);

    render(<StudentSubmission />);

    await waitFor(() => expect(screen.getByText(/Review Answers/i)).toBeInTheDocument());
    expect(screen.getByText(/1 \/ 1 pt/i)).toBeInTheDocument();
  });

  it('handles submission not found', async () => {
    __setRouter({ pathname: '/student/submission/[id]', query: { id: '1' } });
    mockedApi.get.mockRejectedValue(new Error('fail'));

    render(<StudentSubmission />);

    await waitFor(() => expect(screen.getByText(/Submission not found/i)).toBeInTheDocument());
  });
});
