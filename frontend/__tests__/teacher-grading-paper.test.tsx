import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../utils/api';
import GradingPage from '../pages/teacher/grading/[id]';
import TeacherPaper from '../pages/teacher/paper/[id]';
import { __setRouter } from 'next/router';

jest.mock('../utils/api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('Teacher grading and paper detail', () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
    mockedApi.put.mockReset();
    window.alert = jest.fn();
  });

  it('loads grading submission and updates score', async () => {
    const back = jest.fn();
    __setRouter({ pathname: '/teacher/grading/[id]', query: { id: '55' }, back });
    mockedApi.get.mockResolvedValueOnce({
      data: {
        paper_title: 'Paper 1',
        student_name: 'Student A',
        score: 80,
        answers: [
          { id: 1, question_text: 'Q1', answer: 'A', score: 5, max_score: 10, is_correct: true }
        ]
      }
    } as any);
    mockedApi.get.mockResolvedValueOnce({
      data: {
        paper_title: 'Paper 1',
        student_name: 'Student A',
        score: 80,
        answers: [
          { id: 1, question_text: 'Q1', answer: 'A', score: 7, max_score: 10, is_correct: true }
        ]
      }
    } as any);

    mockedApi.put.mockResolvedValueOnce({ data: {} } as any);

    render(<GradingPage />);

    await waitFor(() => expect(screen.getByText(/Grading: Paper 1/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(back).toHaveBeenCalled();

    const scoreInput = screen.getByDisplayValue('5') as HTMLInputElement;
    fireEvent.change(scoreInput, { target: { value: '7' } });
    fireEvent.blur(scoreInput);

    await waitFor(() => expect(mockedApi.put).toHaveBeenCalledWith('/submissions/answers/1/score', { score: 7 }));
  });

  it('handles score update failure', async () => {
    __setRouter({ pathname: '/teacher/grading/[id]', query: { id: '55' }, back: jest.fn() });
    mockedApi.get.mockResolvedValueOnce({
      data: {
        paper_title: 'Paper 1',
        student_name: 'Student A',
        score: 80,
        answers: [
          { id: 1, question_text: 'Q1', answer: 'A', score: 5, max_score: 10, is_correct: false }
        ]
      }
    } as any);

    mockedApi.put.mockRejectedValueOnce(new Error('fail'));

    render(<GradingPage />);

    await waitFor(() => expect(screen.getByText(/Grading: Paper 1/i)).toBeInTheDocument());
    const scoreInput = screen.getByDisplayValue('5') as HTMLInputElement;
    fireEvent.change(scoreInput, { target: { value: '3' } });
    fireEvent.blur(scoreInput);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to update score'));
  });

  it('edits paper question and saves', async () => {
    __setRouter({ pathname: '/teacher/paper/[id]', query: { id: '2' } });
    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 2,
        title: 'Paper 2',
        questions: [
          {
            id: 10,
            question_text: 'Question text',
            question_type: 'mcq',
            options: ['Opt A', 'Opt B'],
            correct_answer: 'A'
          }
        ]
      }
    } as any);

    mockedApi.put.mockResolvedValueOnce({ data: {} } as any);

    render(<TeacherPaper />);

    await waitFor(() => expect(screen.getByText('Question 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }));

    const textArea = screen.getByDisplayValue('Question text') as HTMLTextAreaElement;
    fireEvent.change(textArea, { target: { value: 'Updated text' } });

    const optionInput = screen.getByDisplayValue('Opt A');
    fireEvent.change(optionInput, { target: { value: 'Opt A+' } });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(mockedApi.put).toHaveBeenCalledWith('/papers/questions/10', expect.any(Object)));
  });

  it('cancels edit and updates correct answer field', async () => {
    __setRouter({ pathname: '/teacher/paper/[id]', query: { id: '3' } });
    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 3,
        title: 'Paper 3',
        questions: [
          {
            id: 10,
            question_text: 'Question text',
            question_type: 'mcq',
            options: ['Opt A', 'Opt B'],
            correct_answer: 'A'
          }
        ]
      }
    } as any);

    render(<TeacherPaper />);

    await waitFor(() => expect(screen.getByText('Question 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }));

    const answerInput = screen.getByDisplayValue('A') as HTMLInputElement;
    fireEvent.change(answerInput, { target: { value: 'B' } });
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(screen.getByText(/Question 1/i)).toBeInTheDocument();
  });

  it('shows alert on paper save failure', async () => {
    __setRouter({ pathname: '/teacher/paper/[id]', query: { id: '2' } });
    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 2,
        title: 'Paper 2',
        questions: [
          {
            id: 10,
            question_text: 'Question text',
            question_type: 'mcq',
            options: ['Opt A', 'Opt B'],
            correct_answer: 'A'
          }
        ]
      }
    } as any);

    mockedApi.put.mockRejectedValueOnce(new Error('fail'));

    render(<TeacherPaper />);

    await waitFor(() => expect(screen.getByText('Question 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to save changes'));
  });

  it('handles submission load failure', async () => {
    __setRouter({ pathname: '/teacher/grading/[id]', query: { id: '55' }, back: jest.fn() });
    mockedApi.get.mockRejectedValueOnce(new Error('fail'));

    render(<GradingPage />);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to load submission'));
    expect(screen.getByText(/Submission not found/i)).toBeInTheDocument();
  });
});
