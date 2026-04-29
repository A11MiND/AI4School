import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import api from '../../../../utils/api';

export default function ListeningBuilder() {
  const router = useRouter();
  const paperId = typeof router.query.paperId === 'string' ? Number(router.query.paperId) : null;

  const [title, setTitle] = useState('HKDSE Listening Practice');
  const [transcript, setTranscript] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [roleScriptText, setRoleScriptText] = useState('A|Hello\nB|Hi, nice to meet you.');
  const [questionsText, setQuestionsText] = useState('mcq|What did speaker A say?|Hello;Goodbye|A');
  const [generatePrompt, setGeneratePrompt] = useState('Two students planning a weekend volunteer activity in English.');
  const [generating, setGenerating] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [showAnswers, setShowAnswers] = useState(true);
  const [saving, setSaving] = useState(false);

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
    const load = async () => {
      try {
        const res = await api.get(`/papers/${paperId}`);
        const p = res.data;
        setTitle(p.title || '');
        setTranscript(p.article_content || '');
        setShowAnswers(Boolean(p.show_answers));
        const cfg = p.writing_config || {};
        setAudioUrl(cfg.audio_url || '');
        const roleScript = Array.isArray(cfg.role_script) ? cfg.role_script : [];
        setRoleScriptText(roleScript.map((item: any) => `${item.role || 'A'}|${item.text || ''}`).join('\n'));

        if (Array.isArray(p.questions)) {
          setQuestionsText(
            p.questions
              .map((q: any) => {
                const opts = Array.isArray(q.options) ? q.options.join(';') : '';
                const answer = typeof q.correct_answer === 'string' ? q.correct_answer : '';
                return `${q.question_type || 'mcq'}|${q.question_text || ''}|${opts}|${answer}`;
              })
              .join('\n')
          );
        }
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, [paperId]);

  const parseRoleScript = () => {
    return roleScriptText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [role, ...textParts] = line.split('|');
        return { role: (role || 'A').trim(), text: textParts.join('|').trim() };
      })
      .filter((item) => item.text);
  };

  const parseQuestions = () => {
    return questionsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [questionType, questionText, optionsRaw, correctAnswer] = line.split('|');
        const options = (optionsRaw || '')
          .split(';')
          .map((v) => v.trim())
          .filter(Boolean);
        return {
          question_type: (questionType || 'mcq').trim(),
          question_text: (questionText || '').trim(),
          options: options.length > 0 ? options : undefined,
          correct_answer: (correctAnswer || '').trim() || undefined,
        };
      })
      .filter((item) => item.question_text);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        transcript: transcript.trim() || null,
        audio_url: audioUrl.trim() || null,
        role_script: parseRoleScript(),
        questions: parseQuestions(),
        show_answers: showAnswers,
      };

      if (paperId) {
        await api.put(`/papers/listening/${paperId}`, payload);
      } else {
        await api.post('/papers/listening', payload);
      }

      router.push('/teacher/paper/listening');
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.detail || 'Failed to save listening paper');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateByAI = async () => {
    const prompt = generatePrompt.trim();
    if (!prompt) {
      alert('Please enter a generation prompt');
      return;
    }

    setGenerating(true);
    try {
      const provider = localStorage.getItem('ai_provider') || 'deepseek';
      const model = localStorage.getItem('ai_model') || '';

      const res = await api.post('/papers/listening/generate-script', {
        prompt,
        question_count: 5,
        ai_provider: provider,
        ai_model: model,
      });
      const data = res.data || {};
      if (data.transcript) {
        setTranscript(String(data.transcript));
      }
      if (Array.isArray(data.role_script)) {
        setRoleScriptText(
          data.role_script
            .map((item: any) => `${item.role || 'A'}|${item.text || ''}`)
            .join('\n')
        );
      }
      if (Array.isArray(data.questions)) {
        setQuestionsText(
          data.questions
            .map((q: any) => {
              const opts = Array.isArray(q.options) ? q.options.join(';') : '';
              const ans = typeof q.correct_answer === 'string' ? q.correct_answer : '';
              return `${q.question_type || 'mcq'}|${q.question_text || ''}|${opts}|${ans}`;
            })
            .join('\n')
        );
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.detail || 'Failed to generate listening content');
    } finally {
      setGenerating(false);
    }
  };

  const handleSynthesizeAudio = async () => {
    const roleScript = parseRoleScript();
    if (roleScript.length === 0 && !transcript.trim()) {
      alert('Please provide role script or transcript before synthesis.');
      return;
    }

    setSynthesizing(true);
    try {
      const model = localStorage.getItem('qwen_tts_model') || 'cosyvoice-v3-plus';

      if (!hasAudioModelCapability('qwen', model)) {
        alert('Please use an audio-capable Qwen model, e.g. cosyvoice-v3-plus / cosyvoice-v3-flash.');
        return;
      }

      const res = await api.post('/papers/listening/synthesize-audio', {
        transcript: transcript.trim() || undefined,
        role_script: roleScript,
        ai_provider: 'qwen',
        ai_model: model,
        default_voice: localStorage.getItem('qwen_tts_voice') || 'Ethan',
      });

      const mergedAudioUrl = res?.data?.audio_url;
      if (mergedAudioUrl) {
        setAudioUrl(String(mergedAudioUrl));
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.detail || 'Failed to synthesize listening audio');
    } finally {
      setSynthesizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Listening Paper Builder</h1>
            <p className="text-slate-500 text-sm">Create listening papers with transcript, role script, and question set.</p>
          </div>
          <Link href="/teacher/paper/listening" className="text-sm text-emerald-700 hover:text-emerald-800">
            Back to Listening Papers
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <div className="border border-sky-200 bg-sky-50 rounded-xl p-4 space-y-3">
            <label className="block text-sm font-medium text-slate-700 mb-1">AI Generate Prompt (English only)</label>
            <textarea
              className="w-full min-h-[80px] border border-slate-300 rounded-lg px-3 py-2"
              value={generatePrompt}
              onChange={(e) => setGeneratePrompt(e.target.value)}
              placeholder="Describe scenario, level, topic, tone..."
            />
            <div className="flex justify-end gap-2">
              <button onClick={handleGenerateByAI} disabled={generating} className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-60">
                {generating ? 'Generating...' : 'AI Generate Transcript + Script + Questions'}
              </button>
              <button onClick={handleSynthesizeAudio} disabled={synthesizing} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60">
                {synthesizing ? 'Synthesizing...' : 'Generate Multi-Voice Audio'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Paper Title</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Audio URL (optional)</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="https://.../audio.mp3" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Transcript</label>
            <textarea className="w-full min-h-[140px] border border-slate-300 rounded-lg px-3 py-2" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role Script (one per line: role|text)</label>
            <textarea className="w-full min-h-[120px] border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm" value={roleScriptText} onChange={(e) => setRoleScriptText(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Questions (one per line: type|question|opt1;opt2|correct)</label>
            <textarea className="w-full min-h-[160px] border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm" value={questionsText} onChange={(e) => setQuestionsText(e.target.value)} />
          </div>

          <label className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
            <span className="text-sm text-slate-700">Show answers after submission</span>
            <input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} />
          </label>

          <div className="flex justify-end gap-3">
            <Link href="/teacher/paper/listening" className="px-4 py-2 text-slate-600 hover:text-slate-800">Cancel</Link>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60">
              {saving ? 'Saving...' : (paperId ? 'Update Listening Paper' : 'Create Listening Paper')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
