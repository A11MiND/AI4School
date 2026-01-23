import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000', // Backend URL
});

api.interceptors.request.use((config) => {
  let token = null;

  // Context-aware token selection
  if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/teacher')) {
          token = localStorage.getItem('teacher_token');
      } else if (path.startsWith('/student')) {
          token = localStorage.getItem('student_token');
      }
      
      // Fallback for shared or legacy pages
      if (!token) {
          token = localStorage.getItem('token');
      }
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
         // Clear specific tokens based on context to avoid "logging out everyone"
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
