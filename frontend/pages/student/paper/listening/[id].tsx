import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import api from '../../../../utils/api';
import { Headphones, Volume2, VolumeX } from 'lucide-react';

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
  const [scriptPlaying, setScriptPlaying] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const query = assignmentId ? `?assignment_id=${assignmentId}` : '';
        const res = await api.get(`/papers/${id}${query}`);
        setPaper(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, [id, assignmentId]);

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
  const roleScript = Array.isArray(paper?.writing_config?.role_script) ? paper.writing_config.role_script : [];

  const stopScriptPlayback = () => {
    if (typeof window === 'undefined') return;
    if ((window as any).speechSynthesis) {
      (window as any).speechSynthesis.cancel();
    }
    setScriptPlaying(false);
  };

  const playScript = () => {
    if (typeof window === 'undefined') return;
    const synthesis = (window as any).speechSynthesis;
    if (!synthesis || roleScript.length === 0) {
      alert('No script audio is available');
      return;
    }

    synthesis.cancel();
    setScriptPlaying(true);

    let idx = 0;
    const speakNext = () => {
      if (idx >= roleScript.length) {
        setScriptPlaying(false);
        return;
      }
      const item = roleScript[idx];
      const utterance = new SpeechSynthesisUtterance(String(item?.text || ''));
      utterance.lang = 'en-US';
      utterance.rate = 0.98;
      utterance.onend = () => {
        idx += 1;
        speakNext();
      };
      utterance.onerror = () => {
        idx += 1;
        speakNext();
      };
      synthesis.speak(utterance);
    };

    speakNext();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Headphones size={24} /> {paper.title}</h1>
        <p className="text-gray-500 mt-1">Listen to the audio and answer the questions below.</p>
      </header>

      {(audioUrl || paper.article_content) && (
        <section className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4">
          {audioUrl ? (
            <audio controls className="w-full">
              <source src={audioUrl} />
            </audio>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">No audio URL provided. Using transcript mode.</p>
          )}

          {roleScript.length > 0 && (
            <div className="flex gap-2">
              <button onClick={playScript} disabled={scriptPlaying} className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-60 inline-flex items-center gap-2">
                <Volume2 size={16} /> {scriptPlaying ? 'Playing...' : 'Play AI Voice Script'}
              </button>
              <button onClick={stopScriptPlayback} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 inline-flex items-center gap-2">
                <VolumeX size={16} /> Stop
              </button>
            </div>
          )}

          {paper.article_content && (
            <details className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Show transcript</summary>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{paper.article_content}</pre>
            </details>
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
