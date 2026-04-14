function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

export function isJwtExpired(token: string, skewSeconds = 30): boolean {
  if (!token || token.split('.').length < 2) {
    return false;
  }

  try {
    const payloadRaw = decodeBase64Url(token.split('.')[1]);
    const payload = JSON.parse(payloadRaw) as { exp?: number };
    if (typeof payload.exp !== 'number') {
      return false;
    }
    const now = Math.floor(Date.now() / 1000);
    return payload.exp <= now + skewSeconds;
  } catch {
    // Non-JWT or malformed tokens are handled by backend 401.
    return false;
  }
}

export function clearAuthForPath(path: string): string {
  if (path.startsWith('/teacher')) {
    localStorage.removeItem('teacher_token');
    localStorage.removeItem('teacher_role');
    return '/teacher/login';
  }
  if (path.startsWith('/student')) {
    localStorage.removeItem('student_token');
    localStorage.removeItem('student_role');
    return '/student/login';
  }
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  return '/';
}
