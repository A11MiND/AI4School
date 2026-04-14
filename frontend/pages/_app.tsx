import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import Layout from '../components/Layout';
import NotificationProvider from '../components/NotificationProvider';
import { useRouter } from 'next/router';
import { clearAuthForPath, isJwtExpired } from '../utils/auth';

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkTokenExpiry = (path: string) => {
      if (path.startsWith('/teacher')) {
        const token = localStorage.getItem('teacher_token') || localStorage.getItem('token');
        if (token && isJwtExpired(token)) {
          const redirectTo = clearAuthForPath(path);
          router.replace(redirectTo);
        }
      }

      if (path.startsWith('/student')) {
        const token = localStorage.getItem('student_token') || localStorage.getItem('token');
        if (token && isJwtExpired(token)) {
          const redirectTo = clearAuthForPath(path);
          router.replace(redirectTo);
        }
      }
    };

    checkTokenExpiry(router.pathname);
    const onRouteChangeStart = (url: string) => checkTokenExpiry(url);
    router.events.on('routeChangeStart', onRouteChangeStart);

    return () => {
      router.events.off('routeChangeStart', onRouteChangeStart);
    };
  }, [router]);

  // Exclude Layout for login/register pages or the root landing page
  const isAuthPage = router.pathname === '/' || router.pathname.includes('/login') || router.pathname.includes('/register');

  if (isAuthPage) {
    return (
      <NotificationProvider>
        <Component {...pageProps} />
      </NotificationProvider>
    );
  }

  return (
    <NotificationProvider>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </NotificationProvider>
  );
}

export default MyApp;
