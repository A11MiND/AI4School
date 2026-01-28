import axios from 'axios';

const requestHandlers: Array<(config: any) => any> = [];
const responseHandlers: Array<{ success: (res: any) => any; failure: (err: any) => any }> = [];

jest.mock('axios', () => ({
  create: jest.fn(() => ({
    interceptors: {
      request: { use: (fn: any) => requestHandlers.push(fn) },
      response: { use: (success: any, failure: any) => responseHandlers.push({ success, failure }) }
    }
  }))
}));

describe('api interceptors', () => {
  beforeEach(() => {
    localStorage.clear();
    requestHandlers.length = 0;
    responseHandlers.length = 0;
    jest.resetModules();
    require('../utils/api');
  });

  const setPath = (path: string) => {
    delete (window as any).location;
    (window as any).location = { pathname: path, href: path };
  };

  it('adds teacher token to request', () => {
    setPath('/teacher/home');
    localStorage.setItem('teacher_token', 't');

    const config = requestHandlers[0]({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer t');
  });

  it('adds student token to request', () => {
    setPath('/student/home');
    localStorage.setItem('student_token', 's');

    const config = requestHandlers[0]({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer s');
  });

  it('uses fallback token', () => {
    setPath('/');
    localStorage.setItem('token', 'legacy');

    const config = requestHandlers[0]({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer legacy');
  });

  it('handles 401 by clearing tokens and redirecting', async () => {
    setPath('/teacher/home');
    localStorage.setItem('teacher_token', 't');

    await responseHandlers[0].failure({ response: { status: 401 } }).catch(() => undefined);

    expect(localStorage.getItem('teacher_token')).toBeNull();
    expect(window.location.href).toBe('/teacher/login');
  });

  it('handles 401 for student context', async () => {
    setPath('/student/home');
    localStorage.setItem('student_token', 's');

    await responseHandlers[0].failure({ response: { status: 401 } }).catch(() => undefined);

    expect(localStorage.getItem('student_token')).toBeNull();
    expect(window.location.href).toBe('/student/login');
  });

  it('handles 401 for default context', async () => {
    setPath('/');
    localStorage.setItem('token', 'legacy');
    localStorage.setItem('role', 'student');

    await responseHandlers[0].failure({ response: { status: 401 } }).catch(() => undefined);

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('role')).toBeNull();
    expect(window.location.href).toBe('/');
  });

  it('returns response on success interceptor', () => {
    const response = { data: { ok: true } };
    const result = responseHandlers[0].success(response);
    expect(result).toBe(response);
  });
});
