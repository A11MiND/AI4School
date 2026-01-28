import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../utils/api';
import TeacherPapers from '../pages/teacher/papers';

jest.mock('../utils/api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('Teacher papers page', () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
    mockedApi.post.mockReset();
    mockedApi.delete.mockReset();
    window.confirm = jest.fn().mockImplementation(() => true);
  });

  it('loads papers and assigns to a class', async () => {
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/papers/') {
        return Promise.resolve({ data: [{ id: 1, title: 'Paper 1', created_at: new Date().toISOString() }] } as any);
      }
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 10, name: 'Class A' }] } as any);
      }
      if (url === '/assignments/') {
        return Promise.resolve({ data: [] } as any);
      }
      if (String(url).startsWith('/assignments/paper/')) {
        return Promise.resolve({ data: [] } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    mockedApi.post.mockResolvedValue({ data: {} } as any);

    render(<TeacherPapers />);

    await waitFor(() => expect(screen.getByText('Paper 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Assign/i }));

    await waitFor(() => expect(screen.getByText(/Manage Assignments/i)).toBeInTheDocument());

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '10' } });
    const deadlineInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(deadlineInput, { target: { value: '2024-01-01T10:00' } });
    fireEvent.change(screen.getByPlaceholderText(/e.g. 60/i), { target: { value: '60' } });
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: /Confirm Assignment/i }));

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/assignments/', expect.any(Object)));

    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
  });

  it('revokes assignment and deletes paper', async () => {
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/papers/') {
        return Promise.resolve({ data: [{ id: 1, title: 'Paper 1', created_at: new Date().toISOString() }] } as any);
      }
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 10, name: 'Class A' }] } as any);
      }
      if (url === '/assignments/') {
        return Promise.resolve({ data: [] } as any);
      }
      if (String(url).startsWith('/assignments/paper/')) {
        return Promise.resolve({
          data: [
            {
              id: 5,
              target_name: 'Class A',
              assigned_at: new Date().toISOString(),
              deadline: null,
              duration_minutes: 30,
              max_attempts: 1
            }
          ]
        } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    mockedApi.delete.mockResolvedValue({ data: {} } as any);

    render(<TeacherPapers />);

    await waitFor(() => expect(screen.getByText('Paper 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Assign/i }));

    await waitFor(() => expect(screen.getByText(/Revoke/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Revoke/i }));

    await waitFor(() => expect(mockedApi.delete).toHaveBeenCalledWith('/assignments/5'));

    fireEvent.click(screen.getByRole('button', { name: /Delete Paper/i }));
    await waitFor(() => expect(mockedApi.delete).toHaveBeenCalledWith('/papers/1'));
  });

  it('shows assign error message', async () => {
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/papers/') {
        return Promise.resolve({ data: [{ id: 1, title: 'Paper 1', created_at: new Date().toISOString() }] } as any);
      }
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 10, name: 'Class A' }] } as any);
      }
      if (url === '/assignments/') {
        return Promise.resolve({ data: [] } as any);
      }
      if (String(url).startsWith('/assignments/paper/')) {
        return Promise.resolve({ data: [] } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    mockedApi.post.mockRejectedValueOnce({ response: { data: { message: 'Assign failed' } } } as any);
    window.alert = jest.fn();

    render(<TeacherPapers />);

    await waitFor(() => expect(screen.getByText('Paper 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Assign/i }));

    await waitFor(() => expect(screen.getByText(/Manage Assignments/i)).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Assignment/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Assign failed'));
  });

  it('handles assignment list fetch error and close modal', async () => {
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/papers/') {
        return Promise.resolve({ data: [{ id: 1, title: 'Paper 1', created_at: new Date().toISOString() }] } as any);
      }
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 10, name: 'Class A' }] } as any);
      }
      if (url === '/assignments/') {
        return Promise.resolve({ data: [] } as any);
      }
      if (String(url).startsWith('/assignments/paper/')) {
        return Promise.reject(new Error('fail'));
      }
      return Promise.resolve({ data: [] } as any);
    });

    render(<TeacherPapers />);

    await waitFor(() => expect(screen.getByText('Paper 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Assign/i }));

    await waitFor(() => expect(screen.getByText(/Manage Assignments/i)).toBeInTheDocument());
    expect(screen.getByText(/hasn't been assigned/i)).toBeInTheDocument();

    const closeButton = document.querySelector('button.text-gray-400') as HTMLButtonElement;
    fireEvent.click(closeButton);
  });

  it('shows revoke error message', async () => {
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/papers/') {
        return Promise.resolve({ data: [{ id: 1, title: 'Paper 1', created_at: new Date().toISOString() }] } as any);
      }
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 10, name: 'Class A' }] } as any);
      }
      if (url === '/assignments/') {
        return Promise.resolve({ data: [] } as any);
      }
      if (String(url).startsWith('/assignments/paper/')) {
        return Promise.resolve({
          data: [
            {
              id: 5,
              target_name: 'Class A',
              assigned_at: new Date().toISOString(),
              deadline: null,
              duration_minutes: 30,
              max_attempts: 1
            }
          ]
        } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    mockedApi.delete.mockRejectedValueOnce(new Error('fail'));
    window.alert = jest.fn();

    render(<TeacherPapers />);

    await waitFor(() => expect(screen.getByText('Paper 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Assign/i }));

    await waitFor(() => expect(screen.getByText(/Revoke/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Revoke/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to revoke'));
  });

  it('skips revoke when confirm cancelled', async () => {
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/papers/') {
        return Promise.resolve({ data: [{ id: 1, title: 'Paper 1', created_at: new Date().toISOString() }] } as any);
      }
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 10, name: 'Class A' }] } as any);
      }
      if (url === '/assignments/') {
        return Promise.resolve({ data: [] } as any);
      }
      if (String(url).startsWith('/assignments/paper/')) {
        return Promise.resolve({
          data: [
            {
              id: 5,
              target_name: 'Class A',
              assigned_at: new Date().toISOString(),
              deadline: null,
              duration_minutes: 30,
              max_attempts: 1
            }
          ]
        } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    window.confirm = jest.fn().mockImplementation(() => false);

    render(<TeacherPapers />);

    await waitFor(() => expect(screen.getByText('Paper 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Assign/i }));

    await waitFor(() => expect(screen.getByText(/Revoke/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Revoke/i }));

    expect(mockedApi.delete).not.toHaveBeenCalled();
  });

  it('skips assignment when class not selected', async () => {
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/papers/') {
        return Promise.resolve({ data: [{ id: 1, title: 'Paper 1', created_at: new Date().toISOString() }] } as any);
      }
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 10, name: 'Class A' }] } as any);
      }
      if (url === '/assignments/') {
        return Promise.resolve({ data: [] } as any);
      }
      if (String(url).startsWith('/assignments/paper/')) {
        return Promise.resolve({ data: [] } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    render(<TeacherPapers />);

    await waitFor(() => expect(screen.getByText('Paper 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Assign/i }));

    await waitFor(() => expect(screen.getByText(/Manage Assignments/i)).toBeInTheDocument());
    const confirmButton = screen.getByRole('button', { name: /Confirm Assignment/i }) as HTMLButtonElement;
    confirmButton.removeAttribute('disabled');
    confirmButton.disabled = false;
    fireEvent.click(confirmButton);
    const reactPropsKey = Object.keys(confirmButton).find((key) => key.startsWith('__reactProps')) as string;
    const onClick = (confirmButton as any)[reactPropsKey]?.onClick as ((event?: unknown) => void) | undefined;
    onClick?.({ preventDefault: () => undefined });

    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('shows default assign error message when no response', async () => {
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/papers/') {
        return Promise.resolve({ data: [{ id: 1, title: 'Paper 1', created_at: new Date().toISOString() }] } as any);
      }
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 10, name: 'Class A' }] } as any);
      }
      if (url === '/assignments/') {
        return Promise.resolve({ data: [] } as any);
      }
      if (String(url).startsWith('/assignments/paper/')) {
        return Promise.resolve({ data: [] } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    mockedApi.post.mockRejectedValueOnce(new Error('fail'));
    window.alert = jest.fn();

    render(<TeacherPapers />);

    await waitFor(() => expect(screen.getByText('Paper 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Assign/i }));

    await waitFor(() => expect(screen.getByText(/Manage Assignments/i)).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Assignment/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Assign failed'));
  });

  it('logs delete error when paper removal fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/papers/') {
        return Promise.resolve({ data: [{ id: 1, title: 'Paper 1', created_at: new Date().toISOString() }] } as any);
      }
      if (url === '/classes/') {
        return Promise.resolve({ data: [] } as any);
      }
      if (url === '/assignments/') {
        return Promise.resolve({ data: [] } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    mockedApi.delete.mockRejectedValueOnce(new Error('fail'));

    render(<TeacherPapers />);

    await waitFor(() => expect(screen.getByText('Paper 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Delete Paper/i }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    errorSpy.mockRestore();
  });

  it('logs load papers failure', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedApi.get.mockRejectedValueOnce(new Error('fail'));

    render(<TeacherPapers />);

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    errorSpy.mockRestore();
  });

  it('renders unlimited time and plural attempts', async () => {
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/papers/') {
        return Promise.resolve({ data: [{ id: 1, title: 'Paper 1', created_at: new Date().toISOString() }] } as any);
      }
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 10, name: 'Class A' }] } as any);
      }
      if (url === '/assignments/') {
        return Promise.resolve({ data: [] } as any);
      }
      if (String(url).startsWith('/assignments/paper/')) {
        return Promise.resolve({
          data: [
            {
              id: 5,
              target_name: 'Class A',
              assigned_at: new Date().toISOString(),
              deadline: new Date().toISOString(),
              duration_minutes: null,
              max_attempts: 3
            }
          ]
        } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    render(<TeacherPapers />);

    await waitFor(() => expect(screen.getByText('Paper 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Assign/i }));

    await waitFor(() => expect(screen.getByText(/Unlimited time/i)).toBeInTheDocument());
    expect(screen.getByText(/3 attempts/i)).toBeInTheDocument();
    expect(screen.getByText(/Due:/i)).toBeInTheDocument();
  });

  it('defaults attempts when empty', async () => {
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/papers/') {
        return Promise.resolve({ data: [{ id: 1, title: 'Paper 1', created_at: new Date().toISOString() }] } as any);
      }
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 10, name: 'Class A' }] } as any);
      }
      if (url === '/assignments/') {
        return Promise.resolve({ data: [] } as any);
      }
      if (String(url).startsWith('/assignments/paper/')) {
        return Promise.resolve({ data: [] } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    mockedApi.post.mockResolvedValueOnce({ data: {} } as any);

    render(<TeacherPapers />);

    await waitFor(() => expect(screen.getByText('Paper 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Assign/i }));

    await waitFor(() => expect(screen.getByText(/Manage Assignments/i)).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '10' } });
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /Confirm Assignment/i }));

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/assignments/', expect.objectContaining({ max_attempts: 1, deadline: null, duration_minutes: null })));
  });
});
