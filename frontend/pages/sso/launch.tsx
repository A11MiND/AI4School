import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../utils/api';

export default function SsoLaunch() {
  const router = useRouter();
  const [message, setMessage] = useState('Preparing AI4School account...');

  useEffect(() => {
    const run = async () => {
      const token = typeof router.query.token === 'string' ? router.query.token : '';
      if (!router.isReady) return;
      if (!token) {
        setMessage('Missing launch token.');
        return;
      }
      try {
        const res = await api.post('/adapter/sso/launch', { token });
        const { access_token, role } = res.data;
        if (!access_token) throw new Error('Missing platform token');
        if (role === 'student') {
          localStorage.setItem('student_token', access_token);
          localStorage.setItem('student_role', role);
          localStorage.removeItem('token');
          router.replace('/student/home');
          return;
        }
        localStorage.setItem('teacher_token', access_token);
        localStorage.setItem('teacher_role', role || 'teacher');
        localStorage.removeItem('token');
        router.replace('/teacher/home');
      } catch (error: any) {
        setMessage(error?.response?.data?.detail || 'SSO launch failed.');
      }
    };
    run();
  }, [router, router.isReady, router.query.token]);

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <section className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">AI4School SSO</h1>
        <p className="mt-4 text-slate-600">{message}</p>
      </section>
    </main>
  );
}
