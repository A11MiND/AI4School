import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import api from '../../../../utils/api';

export default function SpeakingBuilder() {
  const router = useRouter();
  const paperId = typeof router.query.paperId === 'string' ? Number(router.query.paperId) : null;

  const [title, setTitle] = useState('HKDSE Speaking Practice');
  const [scenario, setScenario] = useState('You are discussing weekend activities with your classmates.');
  const [examinerPersona, setExaminerPersona] = useState('Friendly but concise oral examiner');
  const [starterPrompt, setStarterPrompt] = useState("Let's begin. Tell me about your hobbies.");
  const [maxTurns, setMaxTurns] = useState(12);
  const [showAnswers, setShowAnswers] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!paperId) return;
    const load = async () => {
      try {
        const res = await api.get(`/papers/${paperId}`);
        const p = res.data;
        setTitle(p.title || '');
        setScenario(p.article_content || '');
        setShowAnswers(Boolean(p.show_answers));
        const cfg = p.writing_config || {};
        setExaminerPersona(cfg.examiner_persona || 'Friendly but concise oral examiner');
        setStarterPrompt(cfg.starter_prompt || "Let's begin. Tell me about your hobbies.");
        setMaxTurns(Number(cfg.max_turns || 12));
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, [paperId]);

  const handleSave = async () => {
    if (!title.trim() || !scenario.trim()) {
      alert('Title and scenario are required');
      return;
    }
    setSaving(true);
    try {
      const runtimeProvider = localStorage.getItem('ai_provider') || 'qwen';
      const runtimeModel = localStorage.getItem('ai_model') || '';
      const runtimeApiKey =
        runtimeProvider === 'deepseek'
          ? localStorage.getItem('deepseek_api_key') || ''
          : runtimeProvider === 'qwen'
            ? localStorage.getItem('qwen_api_key') || ''
            : runtimeProvider === 'openrouter'
              ? localStorage.getItem('openrouter_api_key') || ''
              : '';
      const runtimeBaseUrl =
        runtimeProvider === 'deepseek'
          ? localStorage.getItem('deepseek_base_url') || ''
          : runtimeProvider === 'qwen'
            ? localStorage.getItem('qwen_base_url') || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
            : runtimeProvider === 'openrouter'
              ? localStorage.getItem('openrouter_base_url') || ''
              : '';
      const runtimeTtsModel = localStorage.getItem('qwen_tts_model') || 'cosyvoice-v3-plus';
      const runtimeTtsVoice = localStorage.getItem('qwen_tts_voice') || 'Ethan';
      const runtimeTtsApiKey = localStorage.getItem('qwen_api_key') || '';
      const runtimeTtsBaseUrl = localStorage.getItem('qwen_base_url') || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
      const payload = {
        title: title.trim(),
        scenario: scenario.trim(),
        examiner_persona: examinerPersona.trim(),
        starter_prompt: starterPrompt.trim(),
        max_turns: maxTurns,
        show_answers: showAnswers,
        runtime_ai: {
          ai_provider: runtimeProvider,
          ai_model: runtimeModel,
          api_key: runtimeApiKey,
          base_url: runtimeBaseUrl,
          tts_model: runtimeTtsModel,
          tts_voice: runtimeTtsVoice,
          tts_api_key: runtimeTtsApiKey,
          tts_base_url: runtimeTtsBaseUrl,
        },
      };
      if (paperId) {
        await api.put(`/papers/speaking/${paperId}`, payload);
      } else {
        await api.post('/papers/speaking', payload);
      }
      router.push('/teacher/paper/speaking');
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.detail || 'Failed to save speaking paper');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Speaking Paper Builder</h1>
            <p className="text-slate-500 text-sm">Define scenario, examiner style, and turn limits for oral practice.</p>
          </div>
          <Link href="/teacher/paper/speaking" className="text-sm text-emerald-700 hover:text-emerald-800">
            Back to Speaking Papers
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Paper Title</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Scenario</label>
            <textarea className="w-full min-h-[120px] border border-slate-300 rounded-lg px-3 py-2" value={scenario} onChange={(e) => setScenario(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Examiner Persona</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2" value={examinerPersona} onChange={(e) => setExaminerPersona(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Starter Prompt</label>
            <textarea className="w-full min-h-[100px] border border-slate-300 rounded-lg px-3 py-2" value={starterPrompt} onChange={(e) => setStarterPrompt(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Max Turns</label>
            <input type="number" min={4} max={30} className="w-40 border border-slate-300 rounded-lg px-3 py-2" value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value || 12))} />
          </div>

          <label className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
            <span className="text-sm text-slate-700">Show answers after submission</span>
            <input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} />
          </label>

          <div className="flex justify-end gap-3">
            <Link href="/teacher/paper/speaking" className="px-4 py-2 text-slate-600 hover:text-slate-800">Cancel</Link>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60">
              {saving ? 'Saving...' : (paperId ? 'Update Speaking Paper' : 'Create Speaking Paper')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
