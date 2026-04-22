import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import api from '../../../../utils/api';
import { Headphones, Clock, ArrowLeft } from 'lucide-react';

type Question = {
  id: number;
  question_text: string;
  question_type: string;
  options?: string[];
};

export default function StudentListeningPaper() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? Number(router.query.id) : null;
  const assignmentId = typeof router.query.assignment_id === 'string' ? Number(router.query.assignment_id) : null;

  const [paper, setPaper] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [needsFullscreen, setNeedsFullscreen] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const query = assignmentId ? `?assignment_id=${assignmentId}` : '';
        const res = await api.get(`/papers/${id}${query}`);
        setPaper(res.data);
        const antiCheat = res.data?.writing_config?.anti_cheat || {};
        const requireFullscreen = antiCheat?.require_fullscreen ?? true;
        if (requireFullscreen) {
          setNeedsFullscreen(!document.fullscreenElement);
        } else {
          setNeedsFullscreen(false);
        }
        if (res.data?.assignment?.duration_minutes) {
          setTimeLeft(Number(res.data.assignment.duration_minutes) * 60);
        }
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, [id, assignmentId]);

  useEffect(() => {
    if (!paper) return;
    const antiCheat = paper?.writing_config?.anti_cheat || {};
    if (!(antiCheat?.require_fullscreen ?? true)) return;
    const handleFullscreenChange = () => setNeedsFullscreen(!document.fullscreenElement);
    setNeedsFullscreen(!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [paper]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          window.clearInterval(timer);
          submit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [timeLeft, paper]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const enterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      setNeedsFullscreen(false);
    } catch {
      alert('Unable to enter fullscreen on this browser.');
    }
  };

  const submit = async () => {
    if (!id || !paper) return;
    setSubmitting(true);
    try {
      const payload = {
        assignment_id: assignmentId || undefined,
        answers: (paper.questions || []).map((q: Question) => ({
          question_id: q.id,
          answer: answers[q.id] || '',
        })),
      };
      const res = await api.post(`/papers/${id}/submit`, payload);
      const submissionId = res.data?.submission_id;
      if (submissionId) {
        router.push(`/student/submission/${submissionId}`);
      } else {
        alert('Submitted successfully');
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.detail || 'Failed to submit listening paper');
    } finally {
      setSubmitting(false);
    }
  };

  if (!paper) return <div className="p-8 text-center text-gray-500">Loading listening paper...</div>;

  const audioUrl = paper?.writing_config?.audio_url as string | undefined;
  const resolvedAudioUrl = audioUrl
    ? (/^https?:\/\//.test(audioUrl)
        ? audioUrl
        : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${audioUrl}`)
    : undefined;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {needsFullscreen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl p-6 max-w-md text-center">
            <h2 className="text-lg font-semibold text-slate-800">Exam Mode: Fullscreen Required</h2>
            <p className="text-sm text-slate-500 mt-2">This listening paper requires fullscreen mode.</p>
            <button onClick={enterFullscreen} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg">Enter Fullscreen</button>
          </div>
        </div>
      )}

      <header className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700">
          <ArrowLeft size={18} /> Exit
        </button>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2"><Headphones size={24} /> {paper.title}</h1>
        <div className="px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2 bg-sky-50 text-sky-700">
          <Clock size={16} /> {formatTime(Math.max(0, timeLeft ?? 0))}
        </div>
      </header>

      {(audioUrl || paper.article_content) && (
        <section className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4">
          {audioUrl ? (
            <audio controls className="w-full">
              <source src={resolvedAudioUrl} />
            </audio>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">No audio URL provided for this paper.</p>
          )}
        </section>
      )}

      <section className="space-y-4">
        {(paper.questions || []).map((q: Question, index: number) => (
          <div key={q.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-3">
            <h3 className="font-semibold text-gray-900">Q{index + 1}. {q.question_text}</h3>
            {Array.isArray(q.options) && q.options.length > 0 ? (
              <div className="space-y-2">
                {q.options.map((opt, idx) => (
                  <label key={idx} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      value={String.fromCharCode(65 + idx)}
                      checked={answers[q.id] === String.fromCharCode(65 + idx)}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                className="w-full min-h-[90px] border border-slate-300 rounded-lg px-3 py-2"
                value={answers[q.id] || ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="Type your answer"
              />
            )}
          </div>
        ))}
      </section>

      <div className="flex justify-end">
        <button onClick={submit} disabled={submitting} className="px-6 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-60">
          {submitting ? 'Submitting...' : 'Submit Listening Paper'}
        </button>
      </div>
    </div>
  );
}
