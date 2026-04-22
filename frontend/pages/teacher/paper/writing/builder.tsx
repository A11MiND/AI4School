import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import api from '../../../../utils/api';

type TaskMode = 'task1' | 'task2' | 'both';

type DocItem = {
    id: number;
    title: string;
    is_folder: boolean;
    content?: string;
};

export default function WritingPaperBuilder() {
    const router = useRouter();
    const paperId = typeof router.query.paperId === 'string' ? Number(router.query.paperId) : null;

    const [title, setTitle] = useState('HKDSE Writing Practice');
    const [selectedTaskMode, setSelectedTaskMode] = useState<TaskMode>('both');
    const [task1Prompt, setTask1Prompt] = useState('');
    const [task2Raw, setTask2Raw] = useState('');
    const [promptAssetUrl, setPromptAssetUrl] = useState('');
    const [customRequirements, setCustomRequirements] = useState('');

    const [docs, setDocs] = useState<DocItem[]>([]);
    const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
    const [useAiGeneration, setUseAiGeneration] = useState(true);
    const [selectedDocContent, setSelectedDocContent] = useState('');
    const [loadingDocContent, setLoadingDocContent] = useState(false);
    const [imageKeywords, setImageKeywords] = useState('');
    const [customImageKeywords, setCustomImageKeywords] = useState('');
    const [qwenImagePrompt, setQwenImagePrompt] = useState('');
    const [generatingImage, setGeneratingImage] = useState(false);

    const [showAnswers, setShowAnswers] = useState(false);
    const [requireFullscreen, setRequireFullscreen] = useState(true);
    const [blockPaste, setBlockPaste] = useState(true);
    const [trackFocusLoss, setTrackFocusLoss] = useState(true);
    const [durationMinutes, setDurationMinutes] = useState(90);

    const [loadingPaper, setLoadingPaper] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);

    const task2PromptPool = useMemo(
        () => task2Raw.split('\n').map(v => v.trim()).filter(Boolean),
        [task2Raw]
    );

    useEffect(() => {
        const loadDocs = async () => {
            try {
                const res = await api.get('/documents/');
                const list = (res.data || []).filter((item: DocItem) => !item.is_folder);
                setDocs(list);
            } catch (error) {
                console.error(error);
            }
        };
        loadDocs();
    }, []);

    useEffect(() => {
        if (!paperId) return;
        const loadPaper = async () => {
            setLoadingPaper(true);
            try {
                const res = await api.get(`/papers/writing/${paperId}`);
                const data = res.data;
                setTitle(data.title || '');
                setShowAnswers(Boolean(data.show_answers));

                const cfg = data.writing_config || {};
                const mode = (cfg.selected_task_mode || 'both') as TaskMode;
                setSelectedTaskMode(mode);
                setDurationMinutes(Number(cfg.duration_minutes || 90));
                setRequireFullscreen(Boolean(cfg.anti_cheat?.require_fullscreen ?? true));
                setBlockPaste(Boolean(cfg.anti_cheat?.block_paste ?? true));
                setTrackFocusLoss(Boolean(cfg.anti_cheat?.track_focus_loss ?? true));
                setSelectedDocId(cfg.source_document_id ? Number(cfg.source_document_id) : null);
                setCustomRequirements(cfg.custom_requirements || '');
                setImageKeywords(cfg.image_keywords || '');
                setCustomImageKeywords(cfg.custom_image_keywords || '');
                setQwenImagePrompt(cfg.qwen_image_prompt || '');

                const task1 = (data.questions || []).find((q: any) => q.writing_task_type === 'task1');
                const task2 = (data.questions || []).find((q: any) => q.writing_task_type === 'task2');
                setTask1Prompt(task1?.question_text || '');
                setPromptAssetUrl(task1?.prompt_asset_url || task2?.prompt_asset_url || '');
                setTask2Raw(((task2?.prompt_options || []) as string[]).join('\n'));
            } catch (error) {
                console.error(error);
                alert('Failed to load writing paper');
            } finally {
                setLoadingPaper(false);
            }
        };
        loadPaper();
    }, [paperId]);

    useEffect(() => {
        if (!selectedDocId) {
            setSelectedDocContent('');
            return;
        }
        const loadDocContent = async () => {
            setLoadingDocContent(true);
            try {
                const res = await api.get(`/documents/${selectedDocId}`);
                setSelectedDocContent(String(res.data?.content || '').trim());
            } catch (error) {
                console.error(error);
                setSelectedDocContent('');
            } finally {
                setLoadingDocContent(false);
            }
        };
        loadDocContent();
    }, [selectedDocId]);

    const extractEventKeywords = () => {
        const source = [task1Prompt, task2Raw, customRequirements, selectedDocContent]
            .join(' ')
            .toLowerCase();
        const tokens = source
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .map((t) => t.trim())
            .filter(Boolean);
        const stopWords = new Set([
            'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'about', 'your', 'their', 'there', 'have',
            'will', 'should', 'would', 'could', 'task', 'write', 'writing', 'paper', 'student', 'students', 'english',
            'hkdse', 'part', 'prompt', 'optional', 'choose', 'response', 'words', 'word', 'mode'
        ]);
        const counts = new Map<string, number>();
        for (const token of tokens) {
            if (token.length < 4 || stopWords.has(token)) continue;
            counts.set(token, (counts.get(token) || 0) + 1);
        }
        const autoKeywords = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word)
            .join(', ');
        setImageKeywords(autoKeywords);
        const merged = [autoKeywords, customImageKeywords].filter(Boolean).join(', ');
        setQwenImagePrompt(merged ? `Illustration for an HKDSE writing prompt scene, key events: ${merged}` : '');
    };

    const applyCustomKeywords = () => {
        const merged = [imageKeywords, customImageKeywords].filter(Boolean).join(', ');
        setQwenImagePrompt(merged ? `Illustration for an HKDSE writing prompt scene, key events: ${merged}` : '');
    };

    const handleGenerate = async () => {
        if (!useAiGeneration) return;
        setGenerating(true);
        try {
            const storedProvider = localStorage.getItem('ai_provider') || 'deepseek';
            const storedModel = localStorage.getItem('ai_model') || '';
            const runtimeApiKey =
                storedProvider === 'deepseek'
                    ? localStorage.getItem('deepseek_api_key') || ''
                    : storedProvider === 'qwen'
                        ? localStorage.getItem('qwen_api_key') || ''
                        : storedProvider === 'openrouter'
                            ? localStorage.getItem('openrouter_api_key') || ''
                            : '';
            const runtimeBaseUrl =
                storedProvider === 'deepseek'
                    ? localStorage.getItem('deepseek_base_url') || ''
                    : storedProvider === 'qwen'
                        ? localStorage.getItem('qwen_base_url') || ''
                        : storedProvider === 'openrouter'
                            ? localStorage.getItem('openrouter_base_url') || ''
                            : '';
            const payload = {
                selected_task_mode: selectedTaskMode,
                source_document_id: selectedDocId,
                source_text: selectedDocContent || undefined,
                custom_requirements: customRequirements,
                ai_provider: storedProvider,
                ai_model: storedModel,
                api_key: runtimeApiKey || undefined,
                base_url: runtimeBaseUrl || undefined,
            };
            if ((storedProvider === 'deepseek' || storedProvider === 'qwen' || storedProvider === 'openrouter') && !runtimeApiKey) {
                alert('Please set an API key in Profile Settings for the selected provider.');
                return;
            }
            const res = await api.post('/papers/writing/generate-prompts', payload);
            if (res.data.task1_prompt) {
                setTask1Prompt(res.data.task1_prompt);
            }
            if (Array.isArray(res.data.task2_prompt_pool)) {
                setTask2Raw(res.data.task2_prompt_pool.join('\n'));
            }
        } catch (error: any) {
            console.error(error);
            alert(error?.response?.data?.detail || 'Failed to generate writing prompts');
        } finally {
            setGenerating(false);
        }
    };

    const handleGeneratePromptAsset = async () => {
        const prompt = qwenImagePrompt.trim();
        if (!prompt) {
            alert('Please enter or generate a Qwen-image prompt first.');
            return;
        }
        const qwenApiKey = localStorage.getItem('qwen_api_key') || '';
        const qwenBaseUrl = localStorage.getItem('qwen_base_url') || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
        if (!qwenApiKey) {
            alert('Please set Qwen API key in Profile Settings first.');
            return;
        }
        setGeneratingImage(true);
        try {
            const res = await api.post('/papers/writing/generate-image', {
                prompt,
                model: 'qwen-image',
                api_key: qwenApiKey,
                base_url: qwenBaseUrl,
                size: '1024x1024',
                n: 1,
            });
            const generatedUrl = String(res.data?.prompt_asset_url || '').trim();
            if (!generatedUrl) {
                throw new Error('No image URL returned');
            }
            setPromptAssetUrl(generatedUrl);
        } catch (error: any) {
            console.error(error);
            alert(error?.response?.data?.detail || error?.message || 'Failed to generate Qwen-image asset');
        } finally {
            setGeneratingImage(false);
        }
    };

    const handlePublish = async () => {
        if (!title.trim()) return alert('Please enter a paper title');
        if ((selectedTaskMode === 'task1' || selectedTaskMode === 'both') && !task1Prompt.trim()) {
            return alert('Task 1 prompt is required for selected mode');
        }
        if ((selectedTaskMode === 'task2' || selectedTaskMode === 'both') && task2PromptPool.length === 0) {
            return alert('Task 2 prompt pool is required for selected mode');
        }

        setSaving(true);
        try {
            const payload = {
                title: title.trim(),
                selected_task_mode: selectedTaskMode,
                task1_prompt: task1Prompt.trim() || null,
                task2_prompt_pool: task2PromptPool,
                prompt_asset_url: promptAssetUrl.trim() || null,
                source_document_id: selectedDocId,
                custom_requirements: customRequirements.trim() || null,
                show_answers: showAnswers,
                writing_config: {
                    duration_minutes: durationMinutes,
                    image_keywords: imageKeywords || null,
                    custom_image_keywords: customImageKeywords || null,
                    qwen_image_prompt: qwenImagePrompt || null,
                    anti_cheat: {
                        require_fullscreen: requireFullscreen,
                        block_paste: blockPaste,
                        track_focus_loss: trackFocusLoss,
                    },
                },
            };

            if (paperId) {
                await api.put(`/papers/writing/${paperId}`, payload);
                alert('Writing paper updated successfully');
            } else {
                await api.post('/papers/writing', payload);
                alert('Writing paper created successfully');
            }
            router.push('/teacher/paper/writing');
        } catch (error: any) {
            console.error(error);
            alert(error?.response?.data?.detail || 'Failed to save writing paper');
        } finally {
            setSaving(false);
        }
    };

    if (loadingPaper) {
        return <div className="p-8 text-center text-slate-500">Loading writing builder...</div>;
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Writing Paper Builder</h1>
                        <p className="text-slate-500 text-sm">
                            {paperId ? 'Edit writing paper' : 'Create writing paper'} with task selection and AI generation
                        </p>
                    </div>
                    <Link href="/teacher/paper/writing" className="text-sm text-emerald-700 hover:text-emerald-800">
                        Back to Writing Papers
                    </Link>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Paper title</label>
                        <input
                            className="w-full border border-slate-300 rounded-lg px-3 py-2"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Select task(s) to publish</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {[
                                { value: 'task1', label: 'Task 1 only (Part A)' },
                                { value: 'task2', label: 'Task 2 only (Part B)' },
                                { value: 'both', label: 'Both Task 1 + Task 2' },
                            ].map((item) => (
                                <label key={item.value} className={`border rounded-lg px-3 py-3 cursor-pointer ${selectedTaskMode === item.value ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                                    <input
                                        type="radio"
                                        name="task-mode"
                                        className="mr-2"
                                        checked={selectedTaskMode === item.value}
                                        onChange={() => setSelectedTaskMode(item.value as TaskMode)}
                                    />
                                    <span className="text-sm text-slate-700">{item.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
                            <span className="text-sm text-slate-700">Use AI generation</span>
                            <input type="checkbox" checked={useAiGeneration} onChange={(e) => setUseAiGeneration(e.target.checked)} />
                        </label>
                        <label className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
                            <span className="text-sm text-slate-700">Show correct answers after submission</span>
                            <input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} />
                        </label>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Source document from Content Library (optional)</label>
                        <select
                            className="w-full border border-slate-300 rounded-lg px-3 py-2"
                            value={selectedDocId ?? ''}
                            onChange={(e) => setSelectedDocId(e.target.value ? Number(e.target.value) : null)}
                        >
                            <option value="">No document selected</option>
                            {docs.map((doc) => (
                                <option key={doc.id} value={doc.id}>{doc.title}</option>
                            ))}
                        </select>
                        {selectedDocId && (
                            <p className="text-xs text-slate-500 mt-1">
                                {loadingDocContent
                                    ? 'Loading source document text...'
                                    : selectedDocContent
                                        ? `Loaded source text (${selectedDocContent.length} chars). AI prompt generation will use this content.`
                                        : 'No extracted text found in this document. Upload txt/docx/pdf with readable text if you want AI to use source text.'}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Custom requirements for AI (optional)</label>
                        <textarea
                            className="w-full min-h-[120px] border border-slate-300 rounded-lg px-3 py-2"
                            value={customRequirements}
                            onChange={(e) => setCustomRequirements(e.target.value)}
                            placeholder="Theme, text type, topic, style requirements..."
                        />
                    </div>

                    {useAiGeneration && (
                        <div className="pt-1">
                            <button
                                type="button"
                                disabled={generating}
                                onClick={handleGenerate}
                                className="px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 disabled:opacity-60"
                            >
                                {generating ? 'Generating...' : 'Generate HKDSE Writing Prompts'}
                            </button>
                        </div>
                    )}

                    {(selectedTaskMode === 'task1' || selectedTaskMode === 'both') && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Task 1 prompt (HKDSE Part A, ~200 words)</label>
                            <textarea
                                className="w-full min-h-[140px] border border-slate-300 rounded-lg px-3 py-2"
                                value={task1Prompt}
                                onChange={(e) => setTask1Prompt(e.target.value)}
                                placeholder="Compulsory task in HK school context with 3 mandatory content points"
                            />
                        </div>
                    )}

                    {(selectedTaskMode === 'task2' || selectedTaskMode === 'both') && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Task 2 prompt pool (HKDSE Part B, one prompt per line)</label>
                            <textarea
                                className="w-full min-h-[180px] border border-slate-300 rounded-lg px-3 py-2"
                                value={task2Raw}
                                onChange={(e) => setTask2Raw(e.target.value)}
                                placeholder="Optional task set under official HKDSE themes, one prompt per line"
                            />
                            <p className="text-xs text-slate-500 mt-1">Current pool size: {task2PromptPool.length}. Student will see random 4 options.</p>
                        </div>
                    )}

                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Qwen-image Prompt Asset (optional)</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <button
                                type="button"
                                onClick={extractEventKeywords}
                                className="px-4 py-2 bg-indigo-100 text-indigo-800 rounded-lg hover:bg-indigo-200"
                            >
                                Extract Event Keywords
                            </button>
                            <input
                                className="md:col-span-2 border border-slate-300 rounded-lg px-3 py-2"
                                value={imageKeywords}
                                onChange={(e) => setImageKeywords(e.target.value)}
                                placeholder="Auto keywords from writing tasks/source doc"
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <button
                                type="button"
                                onClick={applyCustomKeywords}
                                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                            >
                                Apply Custom Keywords
                            </button>
                            <input
                                className="md:col-span-2 border border-slate-300 rounded-lg px-3 py-2"
                                value={customImageKeywords}
                                onChange={(e) => setCustomImageKeywords(e.target.value)}
                                placeholder="Custom keywords (comma separated)"
                            />
                        </div>
                        <textarea
                            className="w-full min-h-[80px] border border-slate-300 rounded-lg px-3 py-2"
                            value={qwenImagePrompt}
                            onChange={(e) => setQwenImagePrompt(e.target.value)}
                            placeholder="Qwen-image prompt (editable)"
                        />
                        <div>
                            <button
                                type="button"
                                onClick={handleGeneratePromptAsset}
                                disabled={generatingImage}
                                className="px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 disabled:opacity-60"
                            >
                                {generatingImage ? 'Generating Qwen-image...' : 'Generate Prompt Asset with Qwen-image'}
                            </button>
                        </div>
                        <input
                            className="w-full border border-slate-300 rounded-lg px-3 py-2"
                            value={promptAssetUrl}
                            onChange={(e) => setPromptAssetUrl(e.target.value)}
                            placeholder="Paste generated Qwen-image URL (or PDF/image URL)"
                        />
                        {promptAssetUrl && (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs text-slate-500 mb-2">Prompt asset preview</p>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={/^https?:\/\//.test(promptAssetUrl) ? promptAssetUrl : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${promptAssetUrl}`}
                                    alt="Prompt asset preview"
                                    className="max-h-64 rounded-lg border border-slate-200 object-contain bg-white"
                                />
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
                            <span className="text-sm text-slate-700">Require fullscreen</span>
                            <input type="checkbox" checked={requireFullscreen} onChange={(e) => setRequireFullscreen(e.target.checked)} />
                        </label>
                        <label className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
                            <span className="text-sm text-slate-700">Block paste</span>
                            <input type="checkbox" checked={blockPaste} onChange={(e) => setBlockPaste(e.target.checked)} />
                        </label>
                        <label className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
                            <span className="text-sm text-slate-700">Track focus loss</span>
                            <input type="checkbox" checked={trackFocusLoss} onChange={(e) => setTrackFocusLoss(e.target.checked)} />
                        </label>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Duration (minutes)</label>
                            <input
                                type="number"
                                className="w-40 border border-slate-300 rounded-lg px-3 py-2"
                                value={durationMinutes}
                                min={10}
                                max={240}
                                onChange={(e) => setDurationMinutes(Number(e.target.value || 90))}
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            disabled={saving}
                            onClick={handlePublish}
                            className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                        >
                            {saving ? 'Saving...' : (paperId ? 'Update Writing Paper' : 'Create Writing Paper')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
