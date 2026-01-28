import React from 'react';
import { render, screen, waitFor, fireEvent, createEvent } from '@testing-library/react';
import axios from 'axios';
import Layout from '../components/Layout';
import Sidebar from '../components/Sidebar';
import ProfileSettings from '../components/ProfileSettings';
import { __setRouter } from 'next/router';

jest.mock('axios');
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, onClick, className, children }: any) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  )
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Shared components', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedAxios.get.mockResolvedValue({
      data: { id: 1, username: 'teacher', full_name: 'Teacher', role: 'teacher' }
    } as any);
  });

  it('renders Layout with children', () => {
    __setRouter({ pathname: '/teacher/home' });
    render(
      <Layout>
        <div>Child Content</div>
      </Layout>
    );
    expect(screen.getByText('Child Content')).toBeInTheDocument();
  });

  it('renders teacher Sidebar menu', async () => {
    localStorage.setItem('teacher_token', 'token');
    __setRouter({ pathname: '/teacher/home' });
    render(<Sidebar />);

    expect(screen.getByText('TEACHER WORKSPACE')).toBeInTheDocument();
    expect(screen.getByText('My Classes')).toBeInTheDocument();
    expect(screen.getByText('Content Library')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Teacher')).toBeInTheDocument());
  });

  it('renders student Sidebar menu', async () => {
    localStorage.setItem('student_token', 'token');
    __setRouter({ pathname: '/student/home' });
    render(<Sidebar />);

    expect(screen.getByText('STUDENT WORKSPACE')).toBeInTheDocument();
    expect(screen.getByText('My Classes')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Teacher')).toBeInTheDocument());
  });

  it('shows sidebar avatar and falls back to username', async () => {
    localStorage.setItem('teacher_token', 'token');
    mockedAxios.get.mockResolvedValueOnce({
      data: { id: 1, username: 'user1', full_name: '', avatar_url: 'uploads/avatar.png', role: 'teacher' }
    } as any);
    __setRouter({ pathname: '/teacher/home' });

    render(<Sidebar />);

    await waitFor(() => expect(screen.getByAltText('Avatar')).toBeInTheDocument());
    expect(screen.getAllByText('user1')).toHaveLength(2);
  });

  it('handles profile fetch error gracefully', async () => {
    localStorage.setItem('teacher_token', 'token');
    mockedAxios.get.mockRejectedValueOnce(new Error('fail'));
    __setRouter({ pathname: '/teacher/home' });

    render(<Sidebar />);

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalled());
    expect(screen.getByText('TEACHER WORKSPACE')).toBeInTheDocument();
  });

  it('prevents navigation for WIP items', async () => {
    localStorage.setItem('teacher_token', 'token');
    __setRouter({ pathname: '/teacher/home' });
    render(<Sidebar />);

    const link = screen.getByText('Writing').closest('a') as HTMLAnchorElement;
    const event = createEvent.click(link);
    const preventDefault = jest.spyOn(event, 'preventDefault');
    fireEvent(link, event);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('renders ProfileSettings for teacher', async () => {
    localStorage.setItem('teacher_token', 'token');
    render(<ProfileSettings role="teacher" />);

    await waitFor(() => expect(screen.getByText('Profile Settings')).toBeInTheDocument());
    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  it('renders student avatar and prefilled fields', async () => {
    localStorage.setItem('student_token', 'token');
    mockedAxios.get.mockResolvedValueOnce({
      data: { id: 2, username: 'student', full_name: 'Student Name', avatar_url: 'uploads/avatar.png', role: 'student' }
    } as any);

    render(<ProfileSettings role="student" />);

    await waitFor(() => expect(screen.getByDisplayValue('Student Name')).toBeInTheDocument());
    const avatar = screen.getByAltText('Avatar') as HTMLImageElement;
    expect(avatar.src).toContain('http://localhost:8000/uploads/avatar.png');
  });

  it('defaults profile fields when names missing', async () => {
    localStorage.setItem('teacher_token', 'token');
    mockedAxios.get.mockResolvedValueOnce({
      data: { id: 3, username: null, full_name: null, role: 'teacher' }
    } as any);

    const { container } = render(<ProfileSettings role="teacher" />);

    await waitFor(() => expect(screen.getByText('Profile Settings')).toBeInTheDocument());
    const inputs = container.querySelectorAll('input[type="text"]');
    expect((inputs[0] as HTMLInputElement).value).toBe('');
    expect((inputs[1] as HTMLInputElement).value).toBe('');
  });

  it('logs out teacher and clears tokens', async () => {
    localStorage.setItem('teacher_token', 'token');
    localStorage.setItem('teacher_role', 'teacher');
    const push = jest.fn();
    __setRouter({ pathname: '/teacher/home', push });

    render(<Sidebar />);

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(localStorage.getItem('teacher_token')).toBeNull();
    expect(localStorage.getItem('teacher_role')).toBeNull();
    expect(push).toHaveBeenCalledWith('/teacher/login');
  });

  it('logs out student and clears tokens', async () => {
    localStorage.setItem('student_token', 'token');
    localStorage.setItem('student_role', 'student');
    const push = jest.fn();
    __setRouter({ pathname: '/student/home', push });

    render(<Sidebar />);

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(localStorage.getItem('student_token')).toBeNull();
    expect(localStorage.getItem('student_role')).toBeNull();
    expect(push).toHaveBeenCalledWith('/student/login');
  });

  it('shows password mismatch error', async () => {
    localStorage.setItem('teacher_token', 'token');
    render(<ProfileSettings role="teacher" />);

    await waitFor(() => expect(screen.getByText('Profile Settings')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Leave blank to keep current/i), { target: { value: 'abc' } });
    fireEvent.change(screen.getByPlaceholderText(/Confirm new password/i), { target: { value: 'def' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/Passwords do not match/i)).toBeInTheDocument();
  });

  it('saves profile changes with password', async () => {
    localStorage.setItem('teacher_token', 'token');
    mockedAxios.put.mockResolvedValueOnce({ data: {} } as any);
    mockedAxios.get.mockResolvedValueOnce({
      data: { id: 1, username: 'teacher', full_name: 'Teacher', role: 'teacher' }
    } as any);

    render(<ProfileSettings role="teacher" />);

    await waitFor(() => expect(screen.getByText('Profile Settings')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/e.g. John Doe/i), { target: { value: 'New Name' } });
    fireEvent.change(screen.getByDisplayValue('teacher'), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByPlaceholderText(/Leave blank to keep current/i), { target: { value: 'abc' } });
    fireEvent.change(screen.getByPlaceholderText(/Confirm new password/i), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockedAxios.put).toHaveBeenCalled());
    expect(await screen.findByText(/Profile updated successfully/i)).toBeInTheDocument();
  });

  it('handles avatar upload error', async () => {
    localStorage.setItem('teacher_token', 'token');
    mockedAxios.post.mockRejectedValueOnce(new Error('fail'));

    const { container } = render(<ProfileSettings role="teacher" />);

    await waitFor(() => expect(screen.getByText('Profile Settings')).toBeInTheDocument());

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'avatar.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText(/Failed to upload avatar/i)).toBeInTheDocument();
  });

  it('ignores avatar change when no file selected', async () => {
    localStorage.setItem('teacher_token', 'token');
    mockedAxios.post.mockClear();

    const { container } = render(<ProfileSettings role="teacher" />);

    await waitFor(() => expect(screen.getByText('Profile Settings')).toBeInTheDocument());

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [] } });

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('renders loading state when no token present', async () => {
    localStorage.clear();
    render(<ProfileSettings role="teacher" />);

    expect(screen.getByText(/Loading profile/i)).toBeInTheDocument();
  });

  it('shows generic error on save failure without detail', async () => {
    localStorage.setItem('teacher_token', 'token');
    mockedAxios.put.mockRejectedValueOnce(new Error('fail'));

    render(<ProfileSettings role="teacher" />);

    await waitFor(() => expect(screen.getByText('Profile Settings')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/Failed to update profile/i)).toBeInTheDocument();
  });

  it('handles profile fetch failure', async () => {
    localStorage.setItem('teacher_token', 'token');
    mockedAxios.get.mockRejectedValueOnce(new Error('fail'));

    render(<ProfileSettings role="teacher" />);

    await waitFor(() => expect(screen.getByText('Profile Settings')).toBeInTheDocument());
  });

  it('triggers avatar picker and uploads successfully', async () => {
    localStorage.setItem('teacher_token', 'token');
    mockedAxios.post.mockResolvedValueOnce({ data: {} } as any);
    mockedAxios.get.mockResolvedValueOnce({
      data: { id: 1, username: 'teacher', full_name: 'Teacher', role: 'teacher' }
    } as any);

    const { container } = render(<ProfileSettings role="teacher" />);

    await waitFor(() => expect(screen.getByText('Profile Settings')).toBeInTheDocument());

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = jest.spyOn(fileInput, 'click');
    const avatarTrigger = container.querySelector('div.relative.group.cursor-pointer') as HTMLDivElement;
    fireEvent.click(avatarTrigger);
    expect(clickSpy).toHaveBeenCalled();

    const file = new File(['hello'], 'avatar.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText(/Avatar updated successfully/i)).toBeInTheDocument();
  });
});
