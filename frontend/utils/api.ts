import axios from 'axios';
import { API_BASE_URL } from './config';

const api = axios.create({
  baseURL: API_BASE_URL,
});

function pickTokenByPath(path: string): string | null {
  const teacherToken = localStorage.getItem('teacher_token');
  const studentToken = localStorage.getItem('student_token');
  const legacyToken = localStorage.getItem('token');

  if (path.startsWith('/teacher')) {
    return teacherToken || legacyToken || studentToken;
  }
  if (path.startsWith('/student')) {
    return studentToken || legacyToken || teacherToken;
  }
  // Shared pages: prefer any namespaced token before legacy token.
  return teacherToken || studentToken || legacyToken;
}

api.interceptors.request.use((config) => {
  let token = null;

  // Context-aware token selection with shared-page fallback.
  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    token = pickTokenByPath(path);
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      if (typeof window !== 'undefined') {
        const requestUrl = String(error?.config?.url || '');
        // Don't globally clear auth state for expected login failures.
        if (requestUrl.includes('/token')) {
          return Promise.reject(error);
        }

        // Clear specific tokens based on context to avoid logging out everyone.
        const path = window.location.pathname;
        if (path.startsWith('/teacher')) {
          localStorage.removeItem('teacher_token');
          window.location.href = '/teacher/login';
        } else if (path.startsWith('/student')) {
          localStorage.removeItem('student_token');
          window.location.href = '/student/login';
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('role');
          window.location.href = '/';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
