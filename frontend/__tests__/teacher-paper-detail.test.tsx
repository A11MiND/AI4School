import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../utils/api';
import TeacherPaperDetail from '../pages/teacher/paper/[id]';
import { __setRouter } from 'next/router';

jest.mock('../utils/api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('Teacher paper detail', () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
    mockedApi.put.mockReset();
    window.alert = jest.fn();
  });

  it('edits options and correct answer', async () => {
    __setRouter({ pathname: '/teacher/paper/[id]', query: { id: '1' } });
    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 1,
        title: 'Paper 1',
        questions: [
          {
            id: 10,
            question_text: 'Q1',
            question_type: 'mcq',
            options: ['A', 'B'],
            correct_answer: { key: 'value' }
          }
        ]
      }
    } as any);
    mockedApi.put.mockResolvedValueOnce({ data: {} } as any);

    render(<TeacherPaperDetail />);

    await waitFor(() => expect(screen.getByText('Q1')).toBeInTheDocument());
    expect(screen.getByText('{"key":"value"}')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Edit/i }));

    const optionInput = screen.getByDisplayValue('A') as HTMLInputElement;
    fireEvent.change(optionInput, { target: { value: 'A1' } });
    expect(screen.getByDisplayValue('A1')).toBeInTheDocument();

    const correctInput = screen.getByDisplayValue('{"key":"value"}') as HTMLInputElement;
    fireEvent.change(correctInput, { target: { value: 'Updated' } });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => expect(mockedApi.put).toHaveBeenCalled());
  });
});
