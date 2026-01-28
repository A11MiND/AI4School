let router = {
  push: jest.fn(),
  back: jest.fn(),
  query: {},
  pathname: '/',
  replace: jest.fn(),
  prefetch: jest.fn(),
};

export const __setRouter = (overrides) => {
  router = { ...router, ...overrides };
};

export const useRouter = () => router;
