import { useRouter } from 'next/router';
import { useEffect, useMemo, useState, type ClipboardEvent, type MouseEvent, type DragEvent } from 'react';
import api from '../../../../utils/api';
import { Clock, Send } from 'lucide-react';

interface WritingQuestion {
    id: number;
    question_text: string;
    question_type: string;
    writing_task_type?: string;
    prompt_asset_url?: string;
    prompt_options?: string[];
}

export default function TakeWritingPaper() {
    const router = useRouter();
    const { id } = router.query;
    const assignmentId = typeof router.query.assignment_id === 'string' ? router.query.assignment_id : null;

    const [paper, setPaper] = useState<any>(null);
    const [task1Answer, setTask1Answer] = useState('');
    const [task2Prompt, setTask2Prompt] = useState('');
    const [task2Answer, setTask2Answer] = useState('');
    const [timeLeft, setTimeLeft] = useState<number>(90 * 60);
    const [submitting, setSubmitting] = useState(false);
    const [needsFullscreen, setNeedsFullscreen] = useState(false);
    const [currentTaskIndex, setCurrentTaskIndex] = useState(0);

    useEffect(() => {
        if (!id) return;
        (async () => {
            try {
                const query = assignmentId ? `?assignment_id=${assignmentId}` : '';
                const res = await api.get(`/papers/writing/${id}${query}`);
                setPaper(res.data);
                const cfg = res.data?.writing_config || {};
                const mins = Number(cfg.duration_minutes || 90);
                setTimeLeft(Math.max(1, mins * 60));
            } catch (e) {
                console.error(e);
            }
        })();
    }, [id, assignmentId]);

    const antiCheat = paper?.writing_config?.anti_cheat || {};

    useEffect(() => {
        if (!paper) return;
        if (!antiCheat.require_fullscreen) return;
        const onFull = () => setNeedsFullscreen(!document.fullscreenElement);
        setNeedsFullscreen(!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onFull);
        return () => document.removeEventListener('fullscreenchange', onFull);
    }, [paper, antiCheat.require_fullscreen]);

    useEffect(() => {
        if (!antiCheat.block_paste) return;
        const onKey = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && ['v', 'c', 'x'].includes(event.key.toLowerCase())) {
                event.preventDefault();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [antiCheat.block_paste]);

    useEffect(() => {
        if (!paper) return;
        if (timeLeft <= 0) {
            submit(true);
            return;
        }
        const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [paper, timeLeft]);

    const task1 = useMemo<WritingQuestion | undefined>(() => paper?.questions?.find((q: WritingQuestion) => q.writing_task_type === 'task1'), [paper]);
    const task2 = useMemo<WritingQuestion | undefined>(() => paper?.questions?.find((q: WritingQuestion) => q.writing_task_type === 'task2'), [paper]);
    const orderedTasks = useMemo<WritingQuestion[]>(() => {
        const list: WritingQuestion[] = [];
        if (task1) list.push(task1);
        if (task2) list.push(task2);
        return list;
    }, [task1, task2]);
    const activeTask = orderedTasks[currentTaskIndex] || null;
    const promptAssetUrl = activeTask?.prompt_asset_url || '';
    const isImagePromptAsset = useMemo(() => {
        if (!promptAssetUrl) return false;
        const normalized = promptAssetUrl.split('?')[0].toLowerCase();
        return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(normalized);
    }, [promptAssetUrl]);
    const isTask1Active = activeTask?.writing_task_type === 'task1';
    const isTask2Active = activeTask?.writing_task_type === 'task2';

    const totalWordCount = useMemo(() => {
        const all = `${task1Answer} ${task2Answer}`.trim();
        return all ? (all.match(/[A-Za-z']+/g) || []).length : 0;
    }, [task1Answer, task2Answer]);

    const activeWordCount = useMemo(() => {
        const text = isTask1Active ? task1Answer : task2Answer;
        return text ? (text.match(/[A-Za-z']+/g) || []).length : 0;
    }, [isTask1Active, task1Answer, task2Answer]);

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
            alert('Unable to enter fullscreen on this device/browser.');
        }
    };

    const blockPromptCopy = (event: ClipboardEvent | MouseEvent | DragEvent) => {
        event.preventDefault();
    };

    const submit = async (force: boolean = false) => {
        if (!paper || submitting) return;
        if (!force && !confirm('Submit writing now?')) return;
        if (task2 && !task2Prompt) {
            alert('Please choose one Task 2 prompt before submitting.');
            return;
        }

        setSubmitting(true);
        try {
            const responses: Array<{ question_id: number; answer: string; selected_prompt?: string }> = [];
            if (task1) responses.push({ question_id: task1.id, answer: task1Answer });
            if (task2) responses.push({ question_id: task2.id, answer: task2Answer, selected_prompt: task2Prompt });

            const payload = {
                assignment_id: assignmentId ? Number(assignmentId) : null,
                strictness: 'moderate',
                responses,
            };

            const res = await api.post(`/papers/writing/${paper.id}/submit`, payload);
            if (document.fullscreenElement) {
                try {
                    await document.exitFullscreen();
                } catch (error) {
                    console.warn('Exit fullscreen failed', error);
                }
            }
            router.push('/student/home');
        } catch (e) {
            console.error(e);
            alert('Submit failed');
        } finally {
            setSubmitting(false);
        }
    };

    if (!paper) {
        return <div className="p-8 text-center text-slate-500">Loading writing task...</div>;
    }

    return (
        <div
            className="min-h-screen bg-slate-50"
            onPaste={antiCheat.block_paste ? (e) => e.preventDefault() : undefined}
        >
            {needsFullscreen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
                    <div className="bg-white rounded-xl p-6 max-w-md text-center">
                        <h2 className="text-lg font-semibold text-slate-800">Fullscreen required</h2>
                        <p className="text-sm text-slate-500 mt-2">Your teacher enabled fullscreen mode for this writing task.</p>
                        <button onClick={enterFullscreen} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg">Enter Fullscreen</button>
                    </div>
                </div>
            )}

            <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
                    <h1 className="font-semibold text-slate-800">{paper.title}</h1>
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-slate-600">Word Count: <span className="font-semibold">{totalWordCount}</span></div>
                        <div className="text-sm text-slate-600">Current Task: <span className="font-semibold">{activeWordCount}</span></div>
                        <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2 ${timeLeft < 300 ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'}`}>
                            <Clock size={16} /> {formatTime(Math.max(0, timeLeft))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                    <div
                        className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 xl:col-span-5"
                        onCopy={blockPromptCopy}
                        onCut={blockPromptCopy}
                        onContextMenu={blockPromptCopy}
                    >
                        <h2 className="font-semibold text-slate-800">Task Prompt</h2>
                        {activeTask && (
                            <div className="border border-slate-200 rounded-lg p-3">
                                <div className="text-sm font-semibold text-slate-700 mb-2">
                                    {isTask1Active ? 'Task 1' : 'Task 2'}
                                </div>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap select-none">{activeTask.question_text}</p>
                            </div>
                        )}
                        {isTask2Active && task2 && (
                            <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                                <div className="text-sm font-semibold text-slate-700">Task 2 (Choose one)</div>
                                {(task2.prompt_options || []).map((opt, idx) => (
                                    <label key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                                        <input
                                            type="radio"
                                            name="task2-prompt"
                                            checked={task2Prompt === opt}
                                            onChange={() => setTask2Prompt(opt)}
                                        />
                                        <span>{opt}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                        {promptAssetUrl && isImagePromptAsset && (
                            <div className="space-y-2">
                                <div className="text-xs font-semibold text-slate-500">Prompt Asset</div>
                                <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
                                    <img
                                        src={promptAssetUrl}
                                        alt="Prompt asset"
                                        className="w-full h-auto max-h-[420px] object-contain rounded"
                                        draggable={false}
                                        onDragStart={blockPromptCopy}
                                    />
                                </div>
                            </div>
                        )}
                        {promptAssetUrl && !isImagePromptAsset && (
                            <a href={promptAssetUrl} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:text-indigo-800">
                                Open prompt asset
                            </a>
                        )}
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 xl:col-span-7">
                        <h2 className="font-semibold text-slate-800">Writing Zone</h2>
                        {isTask1Active && (
                            <div>
                                <div className="text-xs font-semibold text-slate-500 mb-1">Task 1 Response</div>
                                <textarea className="w-full min-h-[460px] border border-slate-300 rounded-lg px-3 py-2 resize-y" value={task1Answer} onChange={e => setTask1Answer(e.target.value)} />
                            </div>
                        )}
                        {isTask2Active && (
                            <div>
                                <div className="text-xs font-semibold text-slate-500 mb-1">Task 2 Response</div>
                                <textarea className="w-full min-h-[460px] border border-slate-300 rounded-lg px-3 py-2 resize-y" value={task2Answer} onChange={e => setTask2Answer(e.target.value)} placeholder={task2Prompt ? `Writing for selected prompt: ${task2Prompt}` : 'Select a Task 2 prompt first'} />
                            </div>
                        )}

                        {orderedTasks.length > 1 && (
                            <div className="flex items-center justify-between gap-3">
                                <button
                                    type="button"
                                    disabled={currentTaskIndex === 0}
                                    onClick={() => setCurrentTaskIndex((prev) => Math.max(0, prev - 1))}
                                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 disabled:opacity-40"
                                >
                                    Previous
                                </button>
                                <div className="text-sm text-slate-500">Task {currentTaskIndex + 1} of {orderedTasks.length}</div>
                                <button
                                    type="button"
                                    disabled={currentTaskIndex >= orderedTasks.length - 1}
                                    onClick={() => setCurrentTaskIndex((prev) => Math.min(orderedTasks.length - 1, prev + 1))}
                                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 disabled:opacity-40"
                                >
                                    Next
                                </button>
                            </div>
                        )}

                        <button onClick={() => submit(false)} disabled={submitting} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2">
                            <Send size={16} /> {submitting ? 'Submitting...' : 'Submit Writing'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
