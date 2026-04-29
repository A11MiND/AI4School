import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../../../utils/api';
import { ArrowLeft, Captions, CaptionsOff, Clock, Mic, MicOff, PhoneCall, PhoneOff } from 'lucide-react';

type Turn = {
  id: number;
  speaker_role: 'student' | 'examiner' | 'system' | string;
  text: string;
  audio_url?: string | null;
};

type RuntimeAI = {
  provider?: string;
  model?: string;
  ttsModel?: string;
  ttsVoice?: string;
};

export default function StudentSpeakingSessionPage() {
  const router = useRouter();
  const paperId = typeof router.query.id === 'string' ? Number(router.query.id) : null;
  const assignmentId = typeof router.query.assignment_id === 'string' ? Number(router.query.assignment_id) : null;

  const [paper, setPaper] = useState<any>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  const [callActive, setCallActive] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [examinerSpeaking, setExaminerSpeaking] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const recognitionRef = useRef<any>(null);
  const speechStopRequestedRef = useRef(false);
  const callActiveRef = useRef(false);
  const micEnabledRef = useRef(true);
  const examinerSpeakingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const sendQueueRef = useRef<string[]>([]);
  const sendingRef = useRef(false);
  const lastSentRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const spokenExaminerIdsRef = useRef<Set<number>>(new Set());
  const pendingSpeechPartsRef = useRef<string[]>([]);
  const speechFlushTimerRef = useRef<number | null>(null);

  const examinerName = useMemo(() => paper?.writing_config?.examiner_persona || 'Examiner', [paper]);

  useEffect(() => {
    callActiveRef.current = callActive;
  }, [callActive]);

  useEffect(() => {
    micEnabledRef.current = micEnabled;
  }, [micEnabled]);

  useEffect(() => {
    examinerSpeakingRef.current = examinerSpeaking;
  }, [examinerSpeaking]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const resolveRuntimeAI = (): RuntimeAI => {
    const qwenTtsModel = localStorage.getItem('qwen_tts_model') || 'qwen3-tts-instruct-flash';
    const qwenTtsVoice = localStorage.getItem('qwen_tts_voice') || 'Ethan';
    const preferredProvider = (localStorage.getItem('ai_provider') || '').toLowerCase();
    const preferredModel = localStorage.getItem('ai_model') || '';
    const provider = ['deepseek', 'qwen', 'openrouter'].includes(preferredProvider) ? preferredProvider : undefined;
    return {
      provider,
      model: preferredModel || undefined,
      ttsModel: qwenTtsModel,
      ttsVoice: qwenTtsVoice,
    };
  };

  const flushPendingSpeech = () => {
    if (speechFlushTimerRef.current) {
      window.clearTimeout(speechFlushTimerRef.current);
      speechFlushTimerRef.current = null;
    }
    const merged = pendingSpeechPartsRef.current.join(' ').replace(/\s+/g, ' ').trim();
    pendingSpeechPartsRef.current = [];
    if (!merged) return;
    sendQueueRef.current.push(merged);
    setInterimText('');
    processQueue().catch(() => null);
  };

  const scheduleSpeechFlush = () => {
    if (speechFlushTimerRef.current) {
      window.clearTimeout(speechFlushTimerRef.current);
    }
    speechFlushTimerRef.current = window.setTimeout(() => {
      flushPendingSpeech();
    }, 900);
  };

  const stopRecognition = () => {
    speechStopRequestedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setListening(false);
    setInterimText('');
  };

  const startRecognition = () => {
    if (typeof window === 'undefined') return;
    if (!callActiveRef.current || !micEnabledRef.current || examinerSpeakingRef.current) return;

    const RecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setSpeechSupported(false);
      setErrorText('Browser does not support speech recognition. Use Chrome/Edge.');
      return;
    }

    if (recognitionRef.current) return;

    const rec = new RecognitionCtor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: any) => {
      let interim = '';
      let hasFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = String(event.results[i][0]?.transcript || '').trim();
        if (!text) continue;
        if (event.results[i].isFinal) {
          pendingSpeechPartsRef.current.push(text);
          hasFinal = true;
        } else {
          interim = text;
        }
      }
      setInterimText(interim);
      if (hasFinal) {
        scheduleSpeechFlush();
      }
    };

    rec.onerror = (event: any) => {
      setListening(false);
      const code = String(event?.error || '').toLowerCase();
      if (code === 'not-allowed') {
        setErrorText('Microphone permission denied. Please allow microphone access and retry.');
      }
    };

    rec.onend = () => {
      flushPendingSpeech();
      const shouldRestart = callActiveRef.current && micEnabledRef.current && !examinerSpeakingRef.current && !speechStopRequestedRef.current;
      recognitionRef.current = null;
      setListening(false);
      if (shouldRestart) {
        window.setTimeout(() => startRecognition(), 200);
      }
    };

    speechStopRequestedRef.current = false;
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  };

  const pauseListeningForExaminer = () => {
    flushPendingSpeech();
    speechStopRequestedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setListening(false);
  };

  const resumeListeningAfterExaminer = () => {
    if (!callActiveRef.current || !micEnabledRef.current) return;
    startRecognition();
  };

  const playAudioUrl = async (audioUrl: string) => {
    if (!audioRef.current) return false;
    const src = /^https?:\/\//.test(audioUrl)
      ? audioUrl
      : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${audioUrl}`;

    return new Promise<boolean>((resolve) => {
      if (!audioRef.current) return resolve(false);
      const a = audioRef.current;
      a.pause();
      a.src = src;

      const cleanup = () => {
        a.onended = null;
        a.onerror = null;
      };

      a.onended = () => {
        cleanup();
        resolve(true);
      };
      a.onerror = () => {
        cleanup();
        resolve(false);
      };

      a.play().catch(() => {
        cleanup();
        resolve(false);
      });
    });
  };

  const fetchSession = async (sid: number) => {
    const res = await api.get(`/papers/speaking/sessions/${sid}`);
    const latestTurns = (res.data?.turns || []) as Turn[];
    setTurns(latestTurns.slice(-40));
    return latestTurns;
  };

  const speakExaminerTurn = async (turn: Turn) => {
    if (!callActiveRef.current) return;
    setExaminerSpeaking(true);
    pauseListeningForExaminer();
    try {
      if (turn.audio_url) {
        const played = await playAudioUrl(turn.audio_url);
        if (!played) {
          setErrorText('Examiner audio playback failed. Please check provider TTS settings.');
        }
      } else {
        setErrorText('Examiner audio missing from backend response. Please check provider TTS settings.');
      }
    } finally {
      setExaminerSpeaking(false);
      resumeListeningAfterExaminer();
    }
  };

  const sendTurnNow = async (text: string) => {
    if (!sessionId || !text.trim()) return;

    const normalized = text.trim();
    const now = Date.now();
    if (normalized === lastSentRef.current.text && now - lastSentRef.current.at < 800) {
      return;
    }
    lastSentRef.current = { text: normalized, at: now };

    const runtime = resolveRuntimeAI();

    await api.post(`/papers/speaking/sessions/${sessionId}/turns`, {
      role: 'student',
      text: normalized,
      ai_provider: runtime.provider,
      ai_model: runtime.model,
      tts_model: runtime.ttsModel,
      voice: runtime.ttsVoice,
    });

    const latest = await fetchSession(sessionId);
    const latestExaminer = [...latest].reverse().find((t) => t.speaker_role !== 'student');
    if (latestExaminer && !spokenExaminerIdsRef.current.has(latestExaminer.id)) {
      spokenExaminerIdsRef.current.add(latestExaminer.id);
      await speakExaminerTurn(latestExaminer);
    }
  };

  const processQueue = async () => {
    if (sendingRef.current || !callActiveRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setErrorText('');

    try {
      while (sendQueueRef.current.length > 0 && callActiveRef.current) {
        const next = sendQueueRef.current.shift();
        if (!next) continue;
        await sendTurnNow(next);
      }
    } catch (err: any) {
      console.error(err);
      setErrorText(err?.response?.data?.detail || 'Voice turn failed.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const startCall = () => {
    if (!speechSupported) {
      setErrorText('Speech recognition unavailable in this browser.');
      return;
    }
    setCallActive(true);
    setMicEnabled(true);
    setErrorText('');
    startRecognition();
  };

  const endCall = () => {
    flushPendingSpeech();
    setCallActive(false);
    setMicEnabled(false);
    sendQueueRef.current = [];
    stopRecognition();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setExaminerSpeaking(false);
  };

  const submitSession = async (auto = false) => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      endCall();
      await api.post(`/papers/speaking/sessions/${sessionId}/complete`);
      alert(auto ? 'Time is up. Speaking submitted.' : 'Speaking submitted.');
      router.push('/student/paper/speaking');
    } catch (err: any) {
      console.error(err);
      setErrorText(err?.response?.data?.detail || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSpeechSupported(Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
    audioRef.current = new Audio();

    return () => {
      flushPendingSpeech();
      endCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!paperId) return;

    const load = async () => {
      setLoading(true);
      try {
        const query = assignmentId ? `?assignment_id=${assignmentId}` : '';
        const res = await api.get(`/papers/${paperId}${query}`);
        setPaper(res.data);

        if (res.data?.assignment?.duration_minutes) {
          setTimeLeft(Number(res.data.assignment.duration_minutes) * 60);
        } else {
          setTimeLeft(null);
        }

        const sessionRes = await api.post(`/papers/speaking/${paperId}/sessions`, {
          assignment_id: assignmentId || undefined,
          max_context_tokens: 1200,
        });

        const sid = Number(sessionRes.data?.session_id);
        setSessionId(sid);
        const latest = await fetchSession(sid);
        const latestExaminer = [...latest].reverse().find((t) => t.speaker_role !== 'student');
        if (latestExaminer) {
          spokenExaminerIdsRef.current.add(latestExaminer.id);
        }
      } catch (err: any) {
        console.error(err);
        setErrorText(err?.response?.data?.detail || 'Failed to initialize speaking session');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [paperId, assignmentId]);

  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) return;

    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [timeLeft !== null]);

  useEffect(() => {
    if (timeLeft === 0) {
      submitSession(true).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  useEffect(() => {
    if (!callActive) return;
    if (micEnabled && !examinerSpeaking) {
      startRecognition();
    } else {
      stopRecognition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callActive, micEnabled, examinerSpeaking]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Preparing speaking session...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            endCall();
            router.back();
          }}
          className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={18} /> Exit
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Mic size={24} /> {paper?.title}</h1>
          <p className="text-gray-500 mt-1">{paper?.article_content}</p>
        </div>
        <div className="px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2 bg-sky-50 text-sky-700">
          <Clock size={16} /> {timeLeft === null ? 'No limit' : formatTime(Math.max(0, timeLeft))}
        </div>
      </header>

      <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <label className="block text-sm font-medium text-slate-700">Call Controls</label>
          <button
            type="button"
            onClick={() => setShowSubtitles((prev) => !prev)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 inline-flex items-center gap-2"
          >
            {showSubtitles ? <Captions size={16} /> : <CaptionsOff size={16} />}
            {showSubtitles ? 'Subtitles ON' : 'Subtitles OFF'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {!callActive ? (
            <button onClick={startCall} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center gap-2">
              <PhoneCall size={16} /> Start Call
            </button>
          ) : (
            <button onClick={endCall} className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 inline-flex items-center gap-2">
              <PhoneOff size={16} /> End Call
            </button>
          )}

          {callActive && (
            <button
              type="button"
              onClick={() => setMicEnabled((prev) => !prev)}
              className={`px-4 py-2 rounded-lg inline-flex items-center gap-2 ${micEnabled ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'}`}
            >
              {micEnabled ? <Mic size={16} /> : <MicOff size={16} />}
              {micEnabled ? 'Mute Mic' : 'Unmute Mic'}
            </button>
          )}

          <button
            type="button"
            onClick={() => submitSession(false)}
            disabled={submitting}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-60"
          >
            {submitting ? 'Submitting...' : 'Submit & End'}
          </button>
        </div>

        <p className="text-xs text-slate-500 mt-3">
          Mode: {callActive ? (examinerSpeaking ? 'Examiner speaking' : listening ? 'Listening to your voice' : 'Call active') : 'Call not started'}
          {sending ? ' | Sending...' : ''}
        </p>

        {interimText && callActive && micEnabled && !examinerSpeaking && (
          <p className="text-xs text-slate-500 mt-1">Live subtitles: {interimText}</p>
        )}

        {errorText && <p className="text-sm text-rose-600 mt-2">{errorText}</p>}
      </section>

      {showSubtitles && (
        <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 space-y-3 min-h-[280px]">
          {turns.length === 0 ? (
            <div className="text-sm text-gray-500">No dialogue yet.</div>
          ) : (
            turns.map((turn) => (
              <div key={turn.id} className={`p-3 rounded-lg ${turn.speaker_role === 'student' ? 'bg-violet-50 ml-10' : 'bg-slate-50 mr-10'}`}>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                  {turn.speaker_role === 'student' ? 'You' : examinerName}
                </div>
                <div className="text-sm text-slate-800 whitespace-pre-wrap">{turn.text}</div>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}
