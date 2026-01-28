import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../utils/api';
import TeacherLogin from '../pages/teacher/login';
import StudentLogin from '../pages/student/login';
import StudentRegister from '../pages/student/register';
import { __setRouter } from 'next/router';

jest.mock('../utils/api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('Auth pages', () => {
  beforeEach(() => {
    localStorage.clear();
    __setRouter({ pathname: '/student/login', push: jest.fn() });
  });

  it('student login success stores token and redirects', async () => {
    mockedApi.post.mockResolvedValue({ data: { access_token: 'token', role: 'student' } } as any);
    render(<StudentLogin />);

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'stu' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(localStorage.getItem('student_token')).toBe('token'));
  });

  it('student login rejects non-student role', async () => {
    mockedApi.post.mockResolvedValue({ data: { access_token: 'token', role: 'teacher' } } as any);
    render(<StudentLogin />);

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'stu' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByText(/Not a student account/i)).toBeInTheDocument());
  });

  it('student login shows error on failure', async () => {
    mockedApi.post.mockRejectedValue(new Error('fail'));
    render(<StudentLogin />);

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'stu' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByText(/Login failed/i)).toBeInTheDocument());
  });

  it('student login routes to registration', () => {
    const push = jest.fn();
    __setRouter({ pathname: '/student/login', push });
    render(<StudentLogin />);

    fireEvent.click(screen.getByRole('button', { name: /Register New Account/i }));
    expect(push).toHaveBeenCalledWith('/student/register');
  });

  it('teacher login success stores token and redirects', async () => {
    __setRouter({ pathname: '/teacher/login', push: jest.fn() });
    mockedApi.post.mockResolvedValue({ data: { access_token: 'token', role: 'teacher' } } as any);
    render(<TeacherLogin />);

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'teacher' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /login as teacher/i }));

    await waitFor(() => expect(localStorage.getItem('teacher_token')).toBe('token'));
  });

  it('teacher login rejects non-teacher role', async () => {
    __setRouter({ pathname: '/teacher/login', push: jest.fn() });
    mockedApi.post.mockResolvedValue({ data: { access_token: 'token', role: 'student' } } as any);
    render(<TeacherLogin />);

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'teacher' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /login as teacher/i }));

    await waitFor(() => expect(screen.getByText(/Not a teacher account/i)).toBeInTheDocument());
  });

  it('teacher login shows error on failure', async () => {
    __setRouter({ pathname: '/teacher/login', push: jest.fn() });
    mockedApi.post.mockRejectedValue(new Error('fail'));
    render(<TeacherLogin />);

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'teacher' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /login as teacher/i }));

    await waitFor(() => expect(screen.getByText(/Login failed/i)).toBeInTheDocument());
  });

  it('student registration success redirects to login', async () => {
    __setRouter({ pathname: '/student/register', push: jest.fn() });
    mockedApi.post.mockResolvedValue({ data: {} } as any);
    const { container } = render(<StudentRegister />);

    const inputs = container.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'new' } });
    fireEvent.change(inputs[1], { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/auth/register', expect.any(Object)));
  });

  it('student registration shows error', async () => {
    __setRouter({ pathname: '/student/register', push: jest.fn() });
    mockedApi.post.mockRejectedValue({ response: { data: { detail: 'fail' } } } as any);
    const { container } = render(<StudentRegister />);

    const inputs = container.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'new' } });
    fireEvent.change(inputs[1], { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(screen.getByText('fail')).toBeInTheDocument());
  });

  it('student registration falls back to generic error', async () => {
    __setRouter({ pathname: '/student/register', push: jest.fn() });
    mockedApi.post.mockRejectedValueOnce(new Error('fail'));
    const { container } = render(<StudentRegister />);

    const inputs = container.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'new' } });
    fireEvent.change(inputs[1], { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(screen.getByText(/Registration failed/i)).toBeInTheDocument());
  });

  it('student registration sign-in button routes', () => {
    const push = jest.fn();
    __setRouter({ pathname: '/student/register', push });
    const { container } = render(<StudentRegister />);

    const button = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(button);

    expect(push).toHaveBeenCalledWith('/student/login');
  });
});
