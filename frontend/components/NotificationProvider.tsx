import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type NoticeType = 'info' | 'success' | 'warning' | 'error';

type NoticePayload = {
  type?: NoticeType;
  title?: string;
  message: string;
  durationMs?: number;
};

type NoticeItem = Required<NoticePayload> & {
  id: number;
};

type NotifierContextValue = {
  notify: (payload: NoticePayload) => void;
};

const NotifierContext = createContext<NotifierContextValue | null>(null);

const toneClass: Record<NoticeType, string> = {
  info: 'bg-slate-900 text-white',
  success: 'bg-emerald-600 text-white',
  warning: 'bg-amber-500 text-white',
  error: 'bg-rose-600 text-white',
};

export const useNotifier = () => {
  const ctx = useContext(NotifierContext);
  if (!ctx) {
    return {
      notify: () => undefined,
    };
  }
  return ctx;
};

export default function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NoticeItem[]>([]);
  const idRef = useRef(1);

  const removeNotice = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((payload: NoticePayload) => {
    const id = idRef.current++;
    const item: NoticeItem = {
      id,
      type: payload.type || 'info',
      title: payload.title || 'Notice',
      message: payload.message,
      durationMs: payload.durationMs ?? 3200,
    };
    setItems((prev) => [...prev, item]);
    window.setTimeout(() => removeNotice(id), item.durationMs);
  }, [removeNotice]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nativeAlert = window.alert;
    window.alert = (message?: unknown) => {
      notify({ type: 'warning', title: 'Notice', message: String(message ?? '') });
    };
    return () => {
      window.alert = nativeAlert;
    };
  }, [notify]);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotifierContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[10000] space-y-2 w-[min(92vw,360px)] pointer-events-none">
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto shadow-lg rounded-xl px-4 py-3 ${toneClass[item.type]} border border-white/20`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{item.title}</div>
                <div className="text-sm opacity-95 mt-0.5">{item.message}</div>
              </div>
              <button
                type="button"
                onClick={() => removeNotice(item.id)}
                className="text-white/90 hover:text-white text-sm"
                aria-label="Close notification"
              >
                x
              </button>
            </div>
          </div>
        ))}
      </div>
    </NotifierContext.Provider>
  );
}
