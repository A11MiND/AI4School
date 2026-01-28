import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../utils/api';
import CreatePaper from '../pages/teacher/create-paper';
import { __setRouter } from 'next/router';

jest.mock('../utils/api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('Teacher create paper', () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
    mockedApi.post.mockReset();
    mockedApi.put.mockReset();
    window.alert = jest.fn();
  });

  it('generates questions and publishes new paper', async () => {
    const push = jest.fn();
    __setRouter({ pathname: '/teacher/create-paper', query: { docId: '5' }, push, back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: { title: 'Doc Title', content: '' }
    } as any);

    mockedApi.post.mockImplementation((url: any) => {
      if (url === '/papers/generate') {
        return Promise.resolve({
          data: [
            {
              question_text: '[1] Sample question?',
              question_type: 'mc',
              options: ['"Opt1"', '"Opt2"'],
              correct_answer: '[A]'
            }
          ]
        } as any);
      }
      if (url === '/papers/') {
        return Promise.resolve({ data: { id: 1 } } as any);
      }
      return Promise.resolve({ data: {} } as any);
    });

    render(<CreatePaper />);

    await waitFor(() => expect(screen.getByDisplayValue('Reading Exam: Doc Title')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Paste or edit the reading passage here/i), { target: { value: 'Doc content' } });

    fireEvent.click(screen.getByRole('button', { name: /Next: Generation Options/i }));
    fireEvent.click(screen.getByText('Vocabulary in Context'));
    fireEvent.click(screen.getByText('MC'));

    fireEvent.click(screen.getByRole('button', { name: /Generate Questions/i }));

    await waitFor(() => expect(screen.getByText('Questions Editor')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('Sample question?'), { target: { value: 'Updated question?' } });

    const optionInput = screen.getByDisplayValue('Opt1');
    fireEvent.change(optionInput, { target: { value: 'Opt1-updated' } });

    fireEvent.click(screen.getAllByRole('button', { name: 'A' })[0]);

    fireEvent.click(screen.getByRole('button', { name: /Save & Publish Paper/i }));

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/papers/', expect.any(Object)));
    expect(push).toHaveBeenCalledWith('/teacher/papers');
  });

  it('fetches document when docId is provided', async () => {
    __setRouter({ pathname: '/teacher/create-paper', query: { docId: '5' }, push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: { title: 'Doc Title', content: 'Doc content' }
    } as any);

    render(<CreatePaper />);

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/documents/5'));
    expect(screen.getByDisplayValue('Reading Exam: Doc Title')).toBeInTheDocument();
  });

  it('loads paper in edit mode and saves updates', async () => {
    const push = jest.fn();
    __setRouter({ pathname: '/teacher/create-paper', query: { paperId: '9' }, push, back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 9,
        title: 'Existing Paper',
        article_content: 'Text',
        questions: [
          {
            id: 11,
            question_text: 'Question 1',
            question_type: 'tf',
            correct_answer: '{"answer":"T","justification":"Because"}'
          }
        ]
      }
    } as any);

    mockedApi.put.mockResolvedValueOnce({ data: {} } as any);

    render(<CreatePaper />);

    await waitFor(() => expect(screen.getByDisplayValue('Existing Paper')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Save & Publish Paper/i }));

    await waitFor(() => expect(mockedApi.put).toHaveBeenCalled());
  });

  it('alerts when document load fails', async () => {
    __setRouter({ pathname: '/teacher/create-paper', query: { docId: '5' }, push: jest.fn(), back: jest.fn() });
    mockedApi.get.mockRejectedValueOnce(new Error('fail'));
    window.alert = jest.fn();

    render(<CreatePaper />);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to load document'));
  });

  it('alerts when paper load fails', async () => {
    __setRouter({ pathname: '/teacher/create-paper', query: { paperId: '9' }, push: jest.fn(), back: jest.fn() });
    mockedApi.get.mockRejectedValueOnce(new Error('fail'));
    window.alert = jest.fn();

    render(<CreatePaper />);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to load paper'));
  });

  it('shows alert on publish failure', async () => {
    __setRouter({ pathname: '/teacher/create-paper', query: { paperId: '9' }, push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 9,
        title: 'Existing Paper',
        article_content: 'Text',
        questions: [
          {
            id: 11,
            question_text: 'Question 1',
            question_type: 'mc',
            options: ['A', 'B'],
            correct_answer: 'A'
          }
        ]
      }
    } as any);

    mockedApi.put.mockRejectedValueOnce(new Error('fail'));

    render(<CreatePaper />);

    await waitFor(() => expect(screen.getByDisplayValue('Existing Paper')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Save & Publish Paper/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Update failed'));
  });

  it('renders multiple question types in edit mode', async () => {
    __setRouter({ pathname: '/teacher/create-paper', query: { paperId: '12' }, push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 12,
        title: 'Mixed Paper',
        article_content: 'Text',
        questions: [
          { id: 1, question_text: 'MCQ?', question_type: 'mcq', options: ['A', 'B'], correct_answer: 'A' },
          { id: 2, question_text: 'TF?', question_type: 'tf', correct_answer: '{"answer":"T","justification":"Because"}' },
          { id: 3, question_text: 'Gap?', question_type: 'gap', correct_answer: 'Answer' },
          { id: 4, question_text: 'Matching?', question_type: 'matching', options: ['One', 'Two'], correct_answer: '1->A' },
          { id: 5, question_text: 'Table?', question_type: 'table', correct_answer: 'Cells' },
          { id: 6, question_text: 'Open?', question_type: 'open_ended', correct_answer: 'Points' },
          { id: 7, question_text: 'Broken?', question_type: 'mcq', options: null, correct_answer: 'A' }
        ]
      }
    } as any);

    render(<CreatePaper />);

    await waitFor(() => expect(screen.getByDisplayValue('Mixed Paper')).toBeInTheDocument());
    expect(screen.getByText(/Sample Answer \/ Justification/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Because')).toBeInTheDocument();
    expect(screen.getByText(/Matching Options/i)).toBeInTheDocument();
    expect(screen.getByText('1. One')).toBeInTheDocument();
    expect(screen.getByText('2. Two')).toBeInTheDocument();
    expect(screen.getByText(/Table\/Chart Completion/i)).toBeInTheDocument();
    expect(screen.getByText(/Error: Options format invalid/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Expected Answer/i).length).toBeGreaterThan(0);
  });

  it('shows alert on generate failure', async () => {
    __setRouter({ pathname: '/teacher/create-paper', query: { docId: '5' }, push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: { title: 'Doc Title', content: 'Doc content' }
    } as any);

    mockedApi.post.mockRejectedValueOnce(new Error('fail'));

    render(<CreatePaper />);

    await waitFor(() => expect(screen.getByDisplayValue('Reading Exam: Doc Title')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Next: Generation Options/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate Questions/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Generation failed'));
  });

  it('handles JSON correct_answer during generation', async () => {
    __setRouter({ pathname: '/teacher/create-paper', query: { docId: '5' }, push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: { title: 'Doc Title', content: 'Doc content' }
    } as any);

    mockedApi.post.mockImplementation((url: any) => {
      if (url === '/papers/generate') {
        return Promise.resolve({
          data: [
            {
              question_text: '[1] Sample question?',
              question_type: 'mc',
              options: ['"Opt1"', '"Opt2"'],
              correct_answer: '["A"]'
            }
          ]
        } as any);
      }
      return Promise.resolve({ data: {} } as any);
    });

    render(<CreatePaper />);

    await waitFor(() => expect(screen.getByDisplayValue('Reading Exam: Doc Title')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Next: Generation Options/i }));
    fireEvent.click(screen.getByText('Vocabulary in Context'));
    fireEvent.click(screen.getByRole('button', { name: /Generate Questions/i }));

    await waitFor(() => expect(screen.getByText('Questions Editor')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Sample question?')).toBeInTheDocument();
  });

  it('toggles objectives and adjusts format counts', async () => {
    __setRouter({ pathname: '/teacher/create-paper', query: { docId: '5' }, push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: { title: 'Doc Title', content: 'Doc content' }
    } as any);

    render(<CreatePaper />);

    await waitFor(() => expect(screen.getByDisplayValue('Reading Exam: Doc Title')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Next: Generation Options/i }));

    const objectiveBtn = screen.getByText('Vocabulary in Context');
    fireEvent.click(objectiveBtn);
    fireEvent.click(objectiveBtn);

    const countInputs = screen.getAllByRole('spinbutton');
    const firstInput = countInputs[0] as HTMLInputElement;
    fireEvent.change(firstInput, { target: { value: '2' } });
    expect(firstInput.value).toBe('2');

    const minusButtons = screen.getAllByRole('button', { name: '-' });
    fireEvent.click(minusButtons[0]);

    const plusButtons = screen.getAllByRole('button', { name: '+' });
    fireEvent.click(plusButtons[0]);

    fireEvent.change(firstInput, { target: { value: '-2' } });
    expect(firstInput.value).toBe('0');
  });

  it('updates title, difficulty, and navigates back', async () => {
    const back = jest.fn();
    __setRouter({ pathname: '/teacher/create-paper', query: { docId: '5' }, push: jest.fn(), back });

    mockedApi.get.mockResolvedValueOnce({
      data: { title: 'Doc Title', content: 'Doc content' }
    } as any);

    render(<CreatePaper />);

    await waitFor(() => expect(screen.getByDisplayValue('Reading Exam: Doc Title')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Enter Paper Title/i), { target: { value: 'New Title' } });

    fireEvent.click(screen.getByRole('button', { name: /Next: Generation Options/i }));
    await waitFor(() => expect(screen.getByText(/Generation Options/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'HARD' }));

    const backButton = document.querySelector('button.text-slate-400') as HTMLButtonElement;
    fireEvent.click(backButton);
    expect(back).toHaveBeenCalled();
  });

  it('navigates back to step 1 from options', async () => {
    __setRouter({ pathname: '/teacher/create-paper', query: { docId: '5' }, push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: { title: 'Doc Title', content: 'Doc content' }
    } as any);

    render(<CreatePaper />);

    await waitFor(() => expect(screen.getByDisplayValue('Reading Exam: Doc Title')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Paste or edit the reading passage here/i), { target: { value: 'Doc content' } });

    fireEvent.click(screen.getByRole('button', { name: /Next: Generation Options/i }));
    await waitFor(() => expect(screen.getByText(/Generation Options/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByText(/Reading Passage \(Preview & Edit\)/i)).toBeInTheDocument();
  });

  it('shows alert when generating without article', async () => {
    __setRouter({ pathname: '/teacher/create-paper', query: { paperId: '9' }, push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: { id: 9, title: 'Existing Paper', article_content: 'Text', questions: [] }
    } as any);
    mockedApi.post.mockResolvedValueOnce({ data: [] } as any);

    render(<CreatePaper />);

    await waitFor(() => expect(screen.getByDisplayValue('Existing Paper')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('Text'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /Back to Options/i }));
    await waitFor(() => expect(screen.getByText(/Generation Options/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Generate Questions/i }));
    expect(window.alert).toHaveBeenCalledWith('Please enter article text');
  });

  it('edits answer fields for multiple question types', async () => {
    __setRouter({ pathname: '/teacher/create-paper', query: { paperId: '22' }, push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 22,
        title: 'Multi Edit',
        article_content: 'Text',
        questions: [
          { id: 1, question_text: 'MCQ?', question_type: 'mcq', options: ['A', 'B'], correct_answer: 'A' },
          { id: 2, question_text: 'TF?', question_type: 'tf', correct_answer: '{"answer":"T","justification":"Because"}' },
          { id: 3, question_text: 'Gap?', question_type: 'gap', correct_answer: 'Answer' },
          { id: 4, question_text: 'Matching?', question_type: 'matching', options: ['One', 'Two'], correct_answer: '1->A' },
          { id: 5, question_text: 'Table?', question_type: 'table', correct_answer: 'Cells' },
          { id: 6, question_text: 'Open?', question_type: 'open_ended', correct_answer: 'Points' }
        ]
      }
    } as any);

    render(<CreatePaper />);

    await waitFor(() => expect(screen.getByDisplayValue('Multi Edit')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: 'A' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'F' }));
    fireEvent.change(screen.getByPlaceholderText(/Why is it True\/False\/Not Given/i), { target: { value: 'Updated' } });
    fireEvent.change(screen.getByPlaceholderText(/Fill-in word\/phrase/i), { target: { value: 'Filled' } });
    fireEvent.change(screen.getByPlaceholderText(/e.g. 1->C, 2->A/i), { target: { value: '1->B' } });
    fireEvent.change(screen.getByPlaceholderText(/Expected answers \/ keywords/i), { target: { value: 'Cells updated' } });
    fireEvent.change(screen.getByPlaceholderText(/Key points or model answer/i), { target: { value: 'Key points' } });
    fireEvent.click(screen.getByRole('button', { name: /Edit Passage/i }));
    expect(screen.getByText(/Reading Passage \(Preview & Edit\)/i)).toBeInTheDocument();
  });

  it('toggles format buttons and updates options selects', async () => {
    __setRouter({ pathname: '/teacher/create-paper', query: { docId: '5' }, push: jest.fn(), back: jest.fn() });

    mockedApi.get.mockResolvedValueOnce({
      data: { title: 'Doc Title', content: 'Doc content' }
    } as any);

    mockedApi.post.mockResolvedValueOnce({ data: [] } as any);

    render(<CreatePaper />);

    await waitFor(() => expect(screen.getByDisplayValue('Reading Exam: Doc Title')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Next: Generation Options/i }));

    const formatButton = screen.getByText('MC');
    fireEvent.click(formatButton);
    fireEvent.click(formatButton);

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'strict' } });
    fireEvent.change(selects[1], { target: { value: 'single-skill' } });
    fireEvent.change(selects[2], { target: { value: 'blog' } });
    fireEvent.change(selects[3], { target: { value: 'informal' } });

    fireEvent.click(screen.getByRole('button', { name: /Generate Questions/i }));

    await waitFor(() => expect(screen.getByText('Questions Editor')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('Reading Exam: Doc Title'), { target: { value: 'Updated Title' } });
  });
});
