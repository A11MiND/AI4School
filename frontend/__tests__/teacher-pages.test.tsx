import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../utils/api';
import TeacherClasses from '../pages/teacher/classes';
import TeacherDocuments from '../pages/teacher/documents';
import { __setRouter } from 'next/router';

jest.mock('../utils/api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('Teacher pages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.get.mockResolvedValue({ data: [] } as any);
    mockedApi.post.mockResolvedValue({ data: {} } as any);
    mockedApi.delete.mockResolvedValue({ data: {} } as any);
  });

  it('creates a class and handles empty state', async () => {
    render(<TeacherClasses />);

    expect(screen.getByText(/No classes found/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Grade 10 English/i), { target: { value: 'Class A' } });
    fireEvent.submit(screen.getByRole('button', { name: /create class/i }).closest('form')!);

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/classes/', { name: 'Class A' }));
  });

  it('loads documents and creates folder', async () => {
    __setRouter({ pathname: '/teacher/documents', push: jest.fn() });
    mockedApi.get.mockResolvedValueOnce({ data: [] } as any);

    render(<TeacherDocuments />);

    await waitFor(() => expect(screen.getByText(/Empty folder/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New Folder/i }));
    fireEvent.change(screen.getByPlaceholderText(/Folder Name/i), { target: { value: 'Folder A' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/documents/create_folder', expect.any(Object)));
  });

  it('handles class create and delete errors', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [{ id: 1, name: 'Class 1' }] } as any);
    mockedApi.post.mockRejectedValueOnce(new Error('fail'));
    mockedApi.delete.mockRejectedValueOnce(new Error('fail'));
    window.alert = jest.fn();
    window.confirm = jest.fn().mockImplementation(() => true);

    render(<TeacherClasses />);

    await waitFor(() => expect(screen.getByText('Class 1')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Grade 10 English/i), { target: { value: 'Class A' } });
    fireEvent.submit(screen.getByRole('button', { name: /create class/i }).closest('form')!);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to create class'));

    fireEvent.click(screen.getByTitle(/Delete Class/i));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to delete class'));
  });

  it('deletes class successfully', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [{ id: 1, name: 'Class 1' }] } as any);
    mockedApi.delete.mockResolvedValueOnce({ data: {} } as any);
    window.confirm = jest.fn().mockImplementation(() => true);

    render(<TeacherClasses />);

    await waitFor(() => expect(screen.getByText('Class 1')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle(/Delete Class/i));

    await waitFor(() => expect(mockedApi.delete).toHaveBeenCalledWith('/classes/1'));
  });

  it('handles class load failure', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('fail'));
    render(<TeacherClasses />);

    await waitFor(() => expect(screen.getByText(/Create New Class/i)).toBeInTheDocument());
  });

  it('does not submit empty class name', async () => {
    render(<TeacherClasses />);

    fireEvent.submit(screen.getByRole('button', { name: /create class/i }).closest('form')!);
    expect(mockedApi.post).not.toHaveBeenCalled();
  });
});
