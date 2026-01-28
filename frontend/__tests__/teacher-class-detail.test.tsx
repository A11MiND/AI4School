import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../utils/api';
import ClassDetails from '../pages/teacher/class/[id]';
import { __setRouter } from 'next/router';

jest.mock('../utils/api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('Teacher class detail page', () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
    mockedApi.post.mockReset();
    mockedApi.delete.mockReset();
    window.confirm = jest.fn().mockImplementation(() => true);
    window.alert = jest.fn();
  });

  it('adds student and views submissions', async () => {
    __setRouter({ pathname: '/teacher/class/[id]', query: { id: '1' } });
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/classes/1/students') {
        return Promise.resolve({ data: [{ id: 2, username: 'student1' }] } as any);
      }
      if (url === '/papers/students/2/submissions') {
        return Promise.resolve({
          data: [
            {
              id: 99,
              paper_title: 'Paper A',
              submitted_at: new Date().toISOString(),
              score: 75
            }
          ]
        } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    mockedApi.post.mockResolvedValue({ data: {} } as any);

    render(<ClassDetails />);

    await waitFor(() => expect(screen.getByText('student1')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Enter Student Username/i), { target: { value: 'student2' } });
    fireEvent.submit(screen.getByRole('button', { name: /Add Student/i }).closest('form')!);

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/classes/1/students', { username: 'student2' }));

    fireEvent.click(screen.getByRole('button', { name: /Performance/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Student Performance' })).toBeInTheDocument());
    expect(screen.getByText(/Paper: Paper A/i)).toBeInTheDocument();

  });

  it('removes student and handles add error', async () => {
    __setRouter({ pathname: '/teacher/class/[id]', query: { id: '1' } });
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/classes/1/students') {
        return Promise.resolve({ data: [{ id: 2, username: 'student1' }] } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });
    mockedApi.post.mockRejectedValueOnce({ response: { data: { detail: 'No user' } } } as any);

    render(<ClassDetails />);

    await waitFor(() => expect(screen.getByText('student1')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Enter Student Username/i), { target: { value: 'student2' } });
    fireEvent.submit(screen.getByRole('button', { name: /Add Student/i }).closest('form')!);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('No user'));

    fireEvent.click(screen.getByTitle(/Remove from Class/i));
    await waitFor(() => expect(mockedApi.delete).toHaveBeenCalledWith('/classes/1/students/2'));
  });

  it('handles load students error gracefully', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    __setRouter({ pathname: '/teacher/class/[id]', query: { id: '1' } });
    mockedApi.get.mockRejectedValueOnce(new Error('fail'));

    render(<ClassDetails />);

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(screen.getByText(/No students in this class yet/i)).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it('does not submit empty student name', async () => {
    __setRouter({ pathname: '/teacher/class/[id]', query: { id: '1' } });
    mockedApi.get.mockResolvedValueOnce({ data: [] } as any);

    render(<ClassDetails />);

    fireEvent.submit(screen.getByRole('button', { name: /Add Student/i }).closest('form')!);
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('shows submission load error and closes modal', async () => {
    __setRouter({ pathname: '/teacher/class/[id]', query: { id: '1' } });
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/classes/1/students') {
        return Promise.resolve({ data: [{ id: 2, username: 'student1' }] } as any);
      }
      if (url === '/papers/students/2/submissions') {
        return Promise.reject(new Error('fail'));
      }
      return Promise.resolve({ data: [] } as any);
    });

    render(<ClassDetails />);

    await waitFor(() => expect(screen.getByText('student1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Performance/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /Student Performance/i })).toBeInTheDocument());
    const closeButton = document.querySelector('button.text-gray-400') as HTMLButtonElement;
    fireEvent.click(closeButton);
  });

  it('alerts when remove student fails', async () => {
    __setRouter({ pathname: '/teacher/class/[id]', query: { id: '1' } });
    mockedApi.get.mockResolvedValueOnce({ data: [{ id: 2, username: 'student1' }] } as any);
    mockedApi.delete.mockRejectedValueOnce(new Error('fail'));

    render(<ClassDetails />);

    await waitFor(() => expect(screen.getByText('student1')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle(/Remove from Class/i));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to remove student'));
  });

  it('shows add student error detail', async () => {
    __setRouter({ pathname: '/teacher/class/[id]', query: { id: '1' } });
    mockedApi.get.mockResolvedValueOnce({ data: [] } as any);
    mockedApi.post.mockRejectedValueOnce({ response: { data: { detail: 'No user' } } } as any);
    window.alert = jest.fn();

    render(<ClassDetails />);

    await waitFor(() => expect(screen.getByText(/Add Student to Class/i)).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Enter Student Username/i), { target: { value: 'missing' } });
    fireEvent.submit(screen.getByRole('button', { name: /Add Student/i }).closest('form')!);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('No user'));
  });

  it('shows add student fallback error', async () => {
    __setRouter({ pathname: '/teacher/class/[id]', query: { id: '1' } });
    mockedApi.get.mockResolvedValueOnce({ data: [] } as any);
    mockedApi.post.mockRejectedValueOnce(new Error('fail'));
    window.alert = jest.fn();

    render(<ClassDetails />);

    await waitFor(() => expect(screen.getByText(/Add Student to Class/i)).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Enter Student Username/i), { target: { value: 'missing' } });
    fireEvent.submit(screen.getByRole('button', { name: /Add Student/i }).closest('form')!);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to add student. Ensure username exists.'));
  });

  it('skips remove when confirm cancelled', async () => {
    __setRouter({ pathname: '/teacher/class/[id]', query: { id: '1' } });
    mockedApi.get.mockResolvedValueOnce({ data: [{ id: 2, username: 'student1' }] } as any);
    window.confirm = jest.fn().mockImplementation(() => false);

    render(<ClassDetails />);

    await waitFor(() => expect(screen.getByText('student1')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle(/Remove from Class/i));

    expect(mockedApi.delete).not.toHaveBeenCalled();
  });

  it('renders submission score bands', async () => {
    __setRouter({ pathname: '/teacher/class/[id]', query: { id: '1' } });
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/classes/1/students') {
        return Promise.resolve({ data: [{ id: 2, username: 'student1' }] } as any);
      }
      if (url === '/papers/students/2/submissions') {
        return Promise.resolve({
          data: [
            { id: 1, paper_title: 'Paper A', submitted_at: new Date().toISOString(), score: 85 },
            { id: 2, paper_title: 'Paper B', submitted_at: new Date().toISOString(), score: 65 },
            { id: 3, paper_title: 'Paper C', submitted_at: new Date().toISOString(), score: 40 }
          ]
        } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    render(<ClassDetails />);

    await waitFor(() => expect(screen.getByText('student1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Performance/i }));

    await waitFor(() => expect(screen.getByText(/Paper: Paper A/i)).toBeInTheDocument());
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });
});
