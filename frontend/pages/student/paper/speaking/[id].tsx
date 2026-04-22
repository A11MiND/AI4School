import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../../../utils/api';
import { Mic, MicOff, Clock, PhoneCall, PhoneOff, ArrowLeft, Captions, CaptionsOff } from 'lucide-react';

type Turn = {
  id: number;
  turn_index: number;
  speaker_role: string;
  text: string;
  audio_url?: string | null;
};

export default function StudentSpeakingSessionPage() {
  const router = useRouter();
  const paperId = typeof router.query.id === 'string' ? Number(router.query.id) : null;
  const assignmentId = typeof router.query.assignment_id === 'string' ? Number(router.query.assignment_id) : null;

  const [paper, setPaper] = useState<any>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [lastSpokenTurnId, setLastSpokenTurnId] = useState<number | null>(null);
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);
  const [needsFullscreen, setNeedsFullscreen] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [queuedUtterances, setQueuedUtterances] = useState<string[]>([]);

  const recognitionRef = useRef<any>(null);
  const callActiveRef = useRef(false);
  const micEnabledRef = useRef(true);
  const interimFlushTimerRef = useRef<number | null>(null);
  const lastQueuedTextRef = useRef<string>('');

  useEffect(() => {
    callActiveRef.current = callActive;
  }, [callActive]);

  useEffect(() => {
    micEnabledRef.current = micEnabled;
  }, [micEnabled]);

  const hasAudioModelCapability = (provider: string, model: string) => {
    if (provider !== 'qwen') return true;
    const normalized = (model || '').toLowerCase();
    return (
      normalized.includes('asr') ||
      normalized.includes('paraformer') ||
      normalized.includes('tts') ||
      normalized.includes('audio') ||
      normalized.includes('livetranslate') ||
      normalized.includes('cosyvoice') ||
      normalized.includes('omni') ||
      normalized.includes('realtime')
    );
  };

  useEffect(() => {
    if (!paperId) return;
    const loadPaper = async () => {
      try {
        const query = assignmentId ? `?assignment_id=${assignmentId}` : '';
        const res = await api.get(`/papers/${paperId}${query}`);
        setPaper(res.data);
        const antiCheat = res.data?.writing_config?.anti_cheat || {};
        const requireFullscreen = antiCheat?.require_fullscreen ?? true;
        setNeedsFullscreen(requireFullscreen ? !document.fullscreenElement : false);
        if (res.data?.assignment?.duration_minutes) {
          setTimeLeft(Number(res.data.assignment.duration_minutes) * 60);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadPaper();
  }, [paperId, assignmentId]);

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
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [timeLeft]);

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
  };

  useEffect(() => {
    if (!sessionId) return;
    fetchSession(sessionId).catch((err) => console.error(err));
  }, [sessionId]);

  const examinerName = useMemo(() => {
    return paper?.writing_config?.examiner_persona || 'Examiner';
  }, [paper]);

  const resolveRuntimeAI = () => {
    const deepseekKey = localStorage.getItem('deepseek_api_key') || '';
    const qwenKey = localStorage.getItem('qwen_api_key') || '';
    const openrouterKey = localStorage.getItem('openrouter_api_key') || '';
    const preferredProvider = (localStorage.getItem('ai_provider') || '').toLowerCase();
    const preferredModel = localStorage.getItem('ai_model') || '';

    let provider = preferredProvider;
    let apiKey = '';
    let model = preferredModel;
    let baseUrl = '';

    if (provider === 'deepseek' && deepseekKey) {
      apiKey = deepseekKey;
      baseUrl = localStorage.getItem('deepseek_base_url') || '';
    } else if (provider === 'qwen' && qwenKey) {
      apiKey = qwenKey;
      baseUrl = localStorage.getItem('qwen_base_url') || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    } else if (provider === 'openrouter' && openrouterKey) {
      apiKey = openrouterKey;
      baseUrl = localStorage.getItem('openrouter_base_url') || '';
    } else if (qwenKey) {
      provider = 'qwen';
      apiKey = qwenKey;
      model = model || 'qwen-plus';
      baseUrl = localStorage.getItem('qwen_base_url') || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    } else if (deepseekKey) {
      provider = 'deepseek';
      apiKey = deepseekKey;
      model = model || 'deepseek-chat';
      baseUrl = localStorage.getItem('deepseek_base_url') || '';
    } else if (openrouterKey) {
      provider = 'openrouter';
      apiKey = openrouterKey;
      model = model || 'openrouter/auto';
      baseUrl = localStorage.getItem('openrouter_base_url') || '';
    } else {
      provider = '';
    }

    return { provider, model, apiKey, baseUrl };
  };

  const speakTextFallback = (text: string) => {
    if (typeof window === 'undefined') return;
    const synth = (window as any).speechSynthesis;
    if (!synth || !text?.trim()) return;
    try {
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'en-US';
      utter.rate = 1;
      utter.pitch = 1;
      synth.speak(utter);
    } catch {
      // ignore browser TTS fallback errors
    }
  };

  const exitAndBack = async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore fullscreen exit errors
    }
    router.back();
  };

  const sendStudentTurn = async (text: string) => {
    if (!sessionId || !text.trim()) return;
    setSending(true);
    try {
      const { provider, model, apiKey, baseUrl } = resolveRuntimeAI();

      const ttsModel = localStorage.getItem('qwen_tts_model') || 'cosyvoice-v3-plus';
      const ttsVoice = localStorage.getItem('qwen_tts_voice') || 'Ethan';
      const qwenApiKey = localStorage.getItem('qwen_api_key') || '';
      const effectiveQwenBaseUrl = localStorage.getItem('qwen_base_url') || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
      const enableQwenTts = hasAudioModelCapability('qwen', ttsModel);

      await api.post(`/papers/speaking/sessions/${sessionId}/turns`, {
        role: 'student',
        text: text.trim(),
        ai_provider: provider || undefined,
        ai_model: model || undefined,
        api_key: apiKey || undefined,
        base_url: (provider === 'qwen' ? effectiveQwenBaseUrl : baseUrl) || undefined,
        tts_model: enableQwenTts ? ttsModel : undefined,
        tts_api_key: enableQwenTts ? (qwenApiKey || undefined) : undefined,
        tts_base_url: enableQwenTts ? effectiveQwenBaseUrl : undefined,
        voice: enableQwenTts ? ttsVoice : undefined,
      });

      await fetchSession(sessionId);
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.detail || 'Failed to send speaking turn');
    } finally {
      setSending(false);
    }
  };

  const stopExaminerSpeech = () => {
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    }
  };

  const stopRecording = () => {
    const recognition = recognitionRef.current;
    if (recognition && typeof recognition.stop === 'function') {
      recognition.stop();
    }
    if (interimFlushTimerRef.current) {
      window.clearTimeout(interimFlushTimerRef.current);
      interimFlushTimerRef.current = null;
    }
    recognitionRef.current = null;
    setRecording(false);
    setInterimText('');
  };

  const startRecording = () => {
    if (typeof window === 'undefined') return;
    const RecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!RecognitionCtor) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    const enqueueUtterance = (rawText: string) => {
      const text = (rawText || '').trim();
      if (!text) return;
      if (text === lastQueuedTextRef.current) return;
      lastQueuedTextRef.current = text;
      setQueuedUtterances((prev) => [...prev, text]);
    };

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

      setInterimText(interim.trim());
      const finalized = finals.trim();
      if (finalized && callActiveRef.current && micEnabledRef.current) {
        enqueueUtterance(finalized);
      }

      const interimCurrent = interim.trim();
      if (interimFlushTimerRef.current) {
        window.clearTimeout(interimFlushTimerRef.current);
      }
      if (interimCurrent && callActiveRef.current && micEnabledRef.current) {
        interimFlushTimerRef.current = window.setTimeout(() => {
          setInterimText((latest) => {
            const textToSend = (latest || '').trim();
            if (textToSend && callActiveRef.current && micEnabledRef.current) {
              enqueueUtterance(textToSend);
            }
            return '';
          });
        }, 2200);
      }
    };

    recognition.onend = () => {
      if (interimFlushTimerRef.current) {
        window.clearTimeout(interimFlushTimerRef.current);
        interimFlushTimerRef.current = null;
      }
      // Important: flush pending interim text before restart; otherwise turns are lost after pauses.
      setInterimText((latest) => {
        const textToSend = (latest || '').trim();
        if (textToSend && callActiveRef.current && micEnabledRef.current) {
          enqueueUtterance(textToSend);
        }
        return '';
      });
      setRecording(false);
      if (callActiveRef.current && micEnabledRef.current) {
        window.setTimeout(() => {
          if (callActiveRef.current && micEnabledRef.current) {
            startRecording();
          }
        }, 200);
      }
    };

    recognition.onerror = () => {
      setRecording(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setRecording(true);
  };

  const startCall = () => {
    if (!speechSupported) {
      alert('This browser does not support live speech recognition. Please use Chrome/Edge.');
      return;
    }
    stopExaminerSpeech();
    setCallActive(true);
    setMicEnabled(true);
    if (!recording) startRecording();
  };

  const endCall = () => {
    stopRecording();
    stopExaminerSpeech();
    setCallActive(false);
    setQueuedUtterances([]);
  };

  const submitSession = async (auto = false) => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      endCall();
      if (document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch {
          // ignore fullscreen exit errors
        }
      }
      await api.post(`/papers/speaking/sessions/${sessionId}/complete`);
      alert(auto ? 'Time is up. Speaking exam submitted.' : 'Speaking exam submitted.');
      router.push('/student/paper/speaking');
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.detail || 'Failed to submit speaking exam');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasRecognition = Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    setSpeechSupported(hasRecognition);
  }, []);

  useEffect(() => {
    if (!sessionId || sending || !callActive) return;
    if (queuedUtterances.length === 0) return;
    const [current, ...rest] = queuedUtterances;
    setQueuedUtterances(rest);
    sendStudentTurn(current).catch(() => null);
  }, [queuedUtterances, sending, callActive, sessionId]);

  useEffect(() => {
    if (timeLeft === 0) {
      submitSession(true).catch(() => null);
    }
  }, [timeLeft]);

  useEffect(() => {
    if (!callActive) return;
    if (!micEnabled) {
      if (recording) stopRecording();
      return;
    }
    if (!recording && speechSupported) {
      startRecording();
    }
  }, [callActive, micEnabled, recording, speechSupported]);

  useEffect(() => {
    if (!turns.length) return;

    const latestExaminerTurn = [...turns].reverse().find((turn) => turn.speaker_role !== 'student');
    if (!latestExaminerTurn) return;
    if (latestExaminerTurn.id === lastSpokenTurnId) return;

    const audioUrl = latestExaminerTurn.audio_url || '';
    if (!audioUrl) {
      speakTextFallback(latestExaminerTurn.text || '');
      setLastSpokenTurnId(latestExaminerTurn.id);
      return;
    }

    const absoluteAudioUrl = /^https?:\/\//.test(audioUrl)
      ? audioUrl
      : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${audioUrl}`;

    const nextAudio = new Audio(absoluteAudioUrl);
    setAudioPlayer(nextAudio);
    nextAudio.play().catch(() => {
      speakTextFallback(latestExaminerTurn.text || '');
    });
    setLastSpokenTurnId(latestExaminerTurn.id);
  }, [turns, lastSpokenTurnId]);

  useEffect(() => {
    return () => {
      if (interimFlushTimerRef.current) {
        window.clearTimeout(interimFlushTimerRef.current);
      }
      if (recognitionRef.current && typeof recognitionRef.current.stop === 'function') {
        recognitionRef.current.stop();
      }
      if (audioPlayer) {
        audioPlayer.pause();
      }
    };
  }, [audioPlayer]);

  if (!paper || starting) {
    return <div className="p-8 text-center text-gray-500">Preparing speaking session...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {needsFullscreen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl p-6 max-w-md text-center">
            <h2 className="text-lg font-semibold text-slate-800">Exam Mode: Fullscreen Required</h2>
            <p className="text-sm text-slate-500 mt-2">This speaking paper requires fullscreen mode.</p>
            <button onClick={enterFullscreen} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg">Enter Fullscreen</button>
          </div>
        </div>
      )}

      <header className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between gap-3">
        <button type="button" onClick={exitAndBack} className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700">
          <ArrowLeft size={18} /> Exit
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Mic size={24} /> {paper.title}</h1>
          <p className="text-gray-500 mt-1">{paper.article_content}</p>
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

        {!speechSupported && (
          <p className="text-sm text-rose-600 mt-3">This browser does not support voice recognition. Please use Chrome/Edge.</p>
        )}

        <p className="text-xs text-slate-500 mt-3">
          Mode: {callActive ? (recording && micEnabled ? 'Listening to your voice' : 'Call running (mic muted/not listening)') : 'Call not started'}
          {sending ? ' | Sending to examiner...' : ''}
        </p>
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

          {interimText && callActive && micEnabled && (
            <div className="text-xs text-slate-500">Live subtitles: {interimText}</div>
          )}
        </section>
      )}
    </div>
  );
}
