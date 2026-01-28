import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../utils/api';
import TeacherDocuments from '../pages/teacher/documents';
import { __setRouter } from 'next/router';

jest.mock('../utils/api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('Teacher documents page', () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
    mockedApi.post.mockReset();
    mockedApi.delete.mockReset();
    window.confirm = jest.fn().mockImplementation(() => true);
    window.alert = jest.fn();
  });

  it('navigates folders and opens files', async () => {
    __setRouter({ pathname: '/teacher/documents', push: jest.fn() });
    mockedApi.get.mockImplementation((url: any, config: any) => {
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1' }] } as any);
      }
      if (url === '/documents/' && config?.params?.parent_id === 1) {
        return Promise.resolve({ data: [] } as any);
      }
      return Promise.resolve({
        data: [
          { id: 1, title: 'Folder 1', is_folder: true, created_at: new Date().toISOString() },
          { id: 2, title: 'File 1', is_folder: false, created_at: new Date().toISOString(), file_path: 'uploads/file.pdf' }
        ]
      } as any);
    });

    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    const { unmount } = render(<TeacherDocuments />);

    await waitFor(() => expect(screen.getByText('Folder 1')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Folder 1'));
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/documents/', { params: { parent_id: 1, class_id: 1 } }));

    fireEvent.click(screen.getByText('Home'));
    await waitFor(() => expect(screen.getByText('File 1')).toBeInTheDocument());

    fireEvent.click(screen.getByText('File 1'));
    expect(openSpy).toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it('uploads file and handles failures', async () => {
    __setRouter({ pathname: '/teacher/documents', push: jest.fn() });
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1' }] } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });
    mockedApi.post.mockResolvedValueOnce({ data: {} } as any);

    const { container } = render(<TeacherDocuments />);

    await waitFor(() => expect(screen.getByText(/Empty folder/i)).toBeInTheDocument());

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /Upload/i }));

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/documents/upload', expect.any(FormData), expect.any(Object)));

    mockedApi.post.mockRejectedValueOnce(new Error('fail'));
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /Upload/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Upload failed'));
  });

  it('skips creating folder when name is empty', async () => {
    __setRouter({ pathname: '/teacher/documents', push: jest.fn() });
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1' }] } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    render(<TeacherDocuments />);

    await waitFor(() => expect(screen.getByText(/Empty folder/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /New Folder/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    expect(mockedApi.post).not.toHaveBeenCalledWith('/documents/create_folder', expect.any(Object));
  });

  it('creates and deletes folders', async () => {
    __setRouter({ pathname: '/teacher/documents', push: jest.fn() });
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1' }] } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });
    mockedApi.post.mockResolvedValueOnce({ data: {} } as any);
    mockedApi.delete.mockResolvedValueOnce({ data: {} } as any);

    const { unmount } = render(<TeacherDocuments />);

    await waitFor(() => expect(screen.getByText(/Empty folder/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New Folder/i }));
    fireEvent.change(screen.getByPlaceholderText(/Folder Name/i), { target: { value: 'Folder A' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/documents/create_folder', expect.any(Object)));

    mockedApi.post.mockRejectedValueOnce(new Error('fail'));
    fireEvent.click(screen.getByRole('button', { name: /New Folder/i }));
    fireEvent.change(screen.getByPlaceholderText(/Folder Name/i), { target: { value: 'Folder B' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to create folder'));

    unmount();

    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1' }] } as any);
      }
      return Promise.resolve({
        data: [{ id: 10, title: 'Delete Me', is_folder: true, created_at: new Date().toISOString() }]
      } as any);
    });

    render(<TeacherDocuments />);

    await waitFor(() => expect(screen.getByText('Delete Me')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Delete'));

    await waitFor(() => expect(mockedApi.delete).toHaveBeenCalledWith('/documents/10', { params: { hard: true } }));
  });

  it('handles load error and ignores upload without file', async () => {
    __setRouter({ pathname: '/teacher/documents', push: jest.fn() });
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1' }] } as any);
      }
      return Promise.reject(new Error('fail'));
    });

    render(<TeacherDocuments />);

    await waitFor(() => expect(screen.getByText(/Empty folder/i)).toBeInTheDocument());

    const uploadButton = screen.getByRole('button', { name: /Upload/i }) as HTMLButtonElement;
    uploadButton.removeAttribute('disabled');
    uploadButton.disabled = false;
    fireEvent.click(uploadButton);
    const reactPropsKey = Object.keys(uploadButton).find((key) => key.startsWith('__reactProps')) as string;
    const onClick = (uploadButton as any)[reactPropsKey]?.onClick as ((event?: unknown) => void) | undefined;
    onClick?.({ preventDefault: () => undefined });
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('sorts folders before files and clears file selection', async () => {
    __setRouter({ pathname: '/teacher/documents', push: jest.fn() });
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1' }] } as any);
      }
      return Promise.resolve({
        data: [
          { id: 2, title: 'File A', is_folder: false, created_at: new Date().toISOString(), file_path: 'uploads/file.pdf' },
          { id: 1, title: 'Folder A', is_folder: true, created_at: new Date().toISOString() },
          { id: 3, title: 'Folder B', is_folder: true, created_at: new Date().toISOString() }
        ]
      } as any);
    });

    const { container } = render(<TeacherDocuments />);

    await waitFor(() => expect(screen.getByText('Folder A')).toBeInTheDocument());
    const headings = Array.from(container.querySelectorAll('h3[title]')).map(h => h.textContent);
    expect(headings[0]).toBe('Folder A');
    expect(headings[1]).toBe('Folder B');

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: null } });
    expect(screen.getByText('Select File')).toBeInTheDocument();
  });

  it('skips delete when confirm is cancelled', async () => {
    __setRouter({ pathname: '/teacher/documents', push: jest.fn() });
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1' }] } as any);
      }
      return Promise.resolve({
        data: [{ id: 10, title: 'Delete Me', is_folder: true, created_at: new Date().toISOString() }]
      } as any);
    });
    window.confirm = jest.fn().mockImplementation(() => false);

    render(<TeacherDocuments />);

    await waitFor(() => expect(screen.getByText('Delete Me')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Delete'));

    expect(mockedApi.delete).not.toHaveBeenCalled();
  });

  it('uploads inside folder, creates exam, and handles delete failure', async () => {
    const push = jest.fn();
    __setRouter({ pathname: '/teacher/documents', push });
    mockedApi.get.mockImplementation((url: any, config: any) => {
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1' }] } as any);
      }
      if (url === '/documents/' && config?.params?.parent_id === 1) {
        return Promise.resolve({
          data: [{ id: 2, title: 'File 1', is_folder: false, created_at: new Date().toISOString(), file_path: 'uploads/file.pdf' }]
        } as any);
      }
      return Promise.resolve({
        data: [{ id: 1, title: 'Folder 1', is_folder: true, created_at: new Date().toISOString() }]
      } as any);
    });
    mockedApi.post.mockResolvedValueOnce({ data: {} } as any);
    mockedApi.delete.mockRejectedValueOnce(new Error('fail'));
    window.confirm = jest.fn().mockImplementation(() => true);

    const { container } = render(<TeacherDocuments />);

    await waitFor(() => expect(screen.getByText('Folder 1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Folder 1'));

    await waitFor(() => expect(screen.getByText('File 1')).toBeInTheDocument());

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /Upload/i }));

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalled());
    expect(mockedApi.post.mock.calls[0][0]).toBe('/documents/upload');

    fireEvent.click(screen.getByTitle('Create Exam'));
    expect(push).toHaveBeenCalledWith('/teacher/create-paper?docId=2');

    fireEvent.click(screen.getByTitle('Delete'));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Delete failed'));
  });

  it('shows unknown date when created_at missing', async () => {
    __setRouter({ pathname: '/teacher/documents', push: jest.fn() });
    mockedApi.get.mockImplementation((url: any) => {
      if (url === '/classes/') {
        return Promise.resolve({ data: [{ id: 1, name: 'Class 1' }] } as any);
      }
      return Promise.resolve({
        data: [{ id: 3, title: 'No Date', is_folder: false, created_at: null, file_path: 'uploads/file.pdf' }]
      } as any);
    });

    render(<TeacherDocuments />);

    await waitFor(() => expect(screen.getByText('No Date')).toBeInTheDocument());
    expect(screen.getByText('Unknown Date')).toBeInTheDocument();
  });
});
