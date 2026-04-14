import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../../../utils/api';
import { Mic, Send, Square, Volume2, VolumeX } from 'lucide-react';

type Turn = {
  id: number;
  turn_index: number;
  speaker_role: string;
  text: string;
  is_compacted?: boolean;
};

export default function StudentSpeakingSessionPage() {
  const router = useRouter();
  const paperId = typeof router.query.id === 'string' ? Number(router.query.id) : null;
  const assignmentId = typeof router.query.assignment_id === 'string' ? Number(router.query.assignment_id) : null;

  const [paper, setPaper] = useState<any>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [tokenEstimate, setTokenEstimate] = useState(0);
  const [compactionCount, setCompactionCount] = useState(0);
  const [inputText, setInputText] = useState('');
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [examinerSpeaking, setExaminerSpeaking] = useState(false);
  const [lastSpokenTurnId, setLastSpokenTurnId] = useState<number | null>(null);

  useEffect(() => {
    if (!paperId) return;
    const loadPaper = async () => {
      try {
        const query = assignmentId ? `?assignment_id=${assignmentId}` : '';
        const res = await api.get(`/papers/${paperId}${query}`);
        setPaper(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    loadPaper();
  }, [paperId, assignmentId]);

  useEffect(() => {
    if (!paperId || sessionId) return;
    const startSession = async () => {
      setStarting(true);
      try {
        const res = await api.post(`/papers/speaking/${paperId}/sessions`, {
          assignment_id: assignmentId || undefined,
          max_context_tokens: 1200,
        });
        setSessionId(res.data.session_id);
      } catch (err: any) {
        console.error(err);
        alert(err?.response?.data?.detail || 'Failed to start speaking session');
      } finally {
        setStarting(false);
      }
    };
    startSession();
  }, [paperId, assignmentId, sessionId]);

  const fetchSession = async (targetSessionId: number) => {
    const res = await api.get(`/papers/speaking/sessions/${targetSessionId}`);
    setTurns(res.data.turns || []);
    setTokenEstimate(res.data.token_estimate || 0);
    setCompactionCount(res.data.compaction_count || 0);
  };

  useEffect(() => {
    if (!sessionId) return;
    fetchSession(sessionId).catch((err) => console.error(err));
  }, [sessionId]);

  const examinerName = useMemo(() => {
    return paper?.writing_config?.examiner_persona || 'Examiner';
  }, [paper]);

  const sendTurn = async () => {
    if (!sessionId || !inputText.trim()) return;
    setSending(true);
    try {
      await api.post(`/papers/speaking/sessions/${sessionId}/turns`, {
        role: 'student',
        text: inputText.trim(),
      });
      setInputText('');
      await fetchSession(sessionId);
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.detail || 'Failed to send turn');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasRecognition = Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    setSpeechSupported(hasRecognition);
    return () => {
      if (typeof window !== 'undefined' && (window as any).speechSynthesis) {
        (window as any).speechSynthesis.cancel();
      }
    };
  }, []);

  const stopExaminerSpeech = () => {
    if (typeof window === 'undefined') return;
    if ((window as any).speechSynthesis) {
      (window as any).speechSynthesis.cancel();
    }
    setExaminerSpeaking(false);
  };

  const startRecording = () => {
    if (typeof window === 'undefined') return;
    const RecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!RecognitionCtor) {
      alert('Speech recognition is not supported in this browser');
      return;
    }

    stopExaminerSpeech();
    const recognition = new RecognitionCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      let finals = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          finals += transcript + ' ';
        } else {
          interim += transcript + ' ';
        }
      }
      if (finals.trim()) {
        setInputText((prev) => `${prev}${prev ? ' ' : ''}${finals.trim()}`.trim());
      }
      setInterimText(interim.trim());
    };

    recognition.onend = () => {
      setRecording(false);
      setInterimText('');
    };

    recognition.onerror = () => {
      setRecording(false);
    };

    recognition.start();
    (window as any).__ai4schoolRecognition = recognition;
    setRecording(true);
  };

  const stopRecording = () => {
    if (typeof window === 'undefined') return;
    const recognition = (window as any).__ai4schoolRecognition;
    if (recognition && typeof recognition.stop === 'function') {
      recognition.stop();
    }
    setRecording(false);
    setInterimText('');
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!turns.length) return;

    const latestExaminerTurn = [...turns].reverse().find((turn) => turn.speaker_role !== 'student');
    if (!latestExaminerTurn) return;
    if (latestExaminerTurn.id === lastSpokenTurnId) return;

    const synthesis = (window as any).speechSynthesis;
    if (!synthesis) return;

    const utterance = new SpeechSynthesisUtterance(latestExaminerTurn.text);
    utterance.lang = 'en-US';
    utterance.rate = 0.98;
    utterance.onstart = () => setExaminerSpeaking(true);
    utterance.onend = () => setExaminerSpeaking(false);
    utterance.onerror = () => setExaminerSpeaking(false);

    synthesis.cancel();
    synthesis.speak(utterance);
    setLastSpokenTurnId(latestExaminerTurn.id);
  }, [turns, lastSpokenTurnId]);

  if (!paper || starting) {
    return <div className="p-8 text-center text-gray-500">Preparing speaking session...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Mic size={24} /> {paper.title}</h1>
        <p className="text-gray-500 mt-1">{paper.article_content}</p>
        <div className="mt-3 text-xs text-slate-500">Token estimate: {tokenEstimate} | Compression count: {compactionCount}</div>
      </header>

      <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 space-y-3 min-h-[360px]">
        {turns.length === 0 ? (
          <div className="text-sm text-gray-500">No dialogue yet.</div>
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className={`p-3 rounded-lg ${turn.speaker_role === 'student' ? 'bg-violet-50 ml-10' : 'bg-slate-50 mr-10'}`}>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                {turn.speaker_role === 'student' ? 'You' : examinerName}
                {turn.is_compacted ? ' (compacted)' : ''}
              </div>
              <div className="text-sm text-slate-800 whitespace-pre-wrap">{turn.text}</div>
            </div>
          ))
        )}
      </section>

      <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">Your response</label>
        <textarea
          className="w-full min-h-[120px] border border-slate-300 rounded-lg px-3 py-2"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type your speaking response here..."
        />
        {interimText && (
          <div className="mt-2 text-xs text-slate-500">Live transcript: {interimText}</div>
        )}
        <div className="flex justify-end mt-3">
          {speechSupported && !recording && (
            <button onClick={startRecording} className="mr-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center gap-2">
              <Mic size={16} /> Start Speaking
            </button>
          )}
          {speechSupported && recording && (
            <button onClick={stopRecording} className="mr-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 inline-flex items-center gap-2">
              <Square size={16} /> Stop / Interrupt
            </button>
          )}
          {examinerSpeaking && (
            <button onClick={stopExaminerSpeech} className="mr-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 inline-flex items-center gap-2">
              <VolumeX size={16} /> Interrupt Examiner
            </button>
          )}
          {!examinerSpeaking && (
            <button disabled className="mr-2 px-4 py-2 bg-slate-100 text-slate-400 rounded-lg inline-flex items-center gap-2 cursor-not-allowed">
              <Volume2 size={16} /> Examiner Voice Ready
            </button>
          )}
          <button onClick={sendTurn} disabled={sending || !inputText.trim()} className="px-5 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-60 inline-flex items-center gap-2">
            <Send size={16} /> {sending ? 'Sending...' : 'Send Turn'}
          </button>
        </div>
      </section>
    </div>
  );
}
