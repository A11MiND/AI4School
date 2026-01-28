import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import api from '../../../utils/api';
import { Clock, ArrowLeft, Send, FileText } from 'lucide-react';

export default function TakePaper() {
    const router = useRouter();
    const { id } = router.query;
    const submissionId = typeof router.query.submission_id === 'string' ? router.query.submission_id : null;
    const isSubmittedView = router.query.submitted === '1' && Boolean(submissionId);
    const [paper, setPaper] = useState<any>(null);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [needsFullscreen, setNeedsFullscreen] = useState(false);

    useEffect(() => {
        if (id) {
            loadPaper();
        }
    }, [id]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            if (isSubmittedView) return;
            setNeedsFullscreen(!document.fullscreenElement);
        };
        if (!isSubmittedView) {
            setNeedsFullscreen(!document.fullscreenElement);
        }
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [isSubmittedView]);

    useEffect(() => {
        if (!isSubmittedView || !submissionId) return;
        if (typeof window === 'undefined') return;
        const stored = window.localStorage.getItem(`paper-${id}-submission-${submissionId}`);
        if (stored) {
            try {
                setAnswers(JSON.parse(stored));
            } catch {
                setAnswers({});
            }
        }
    }, [isSubmittedView, submissionId, id]);

    useEffect(() => {
        const handleKeydown = (event: KeyboardEvent) => {
            if (event.ctrlKey || event.metaKey) {
                const blocked = ['c', 'x', 'a', 'p', 's'];
                if (blocked.includes(event.key.toLowerCase())) {
                    event.preventDefault();
                }
            }
        };
        window.addEventListener('keydown', handleKeydown);
        return () => window.removeEventListener('keydown', handleKeydown);
    }, []);

    const loadPaper = async () => {
        try {
            const res = await api.get(`/papers/${id}`);
            const p = res.data;
            // Ensure fresh start for "Take Paper" mode
            setPaper({ ...p, submission: null });

            if (p.assignment?.duration_minutes) {
                setTimeLeft(p.assignment.duration_minutes * 60);
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (timeLeft === null || timeLeft <= 0) return;
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev !== null && prev <= 1) {
                    clearInterval(timer);
                    alert("Time is up! Auto-submitting...");
                    submitPaper(true);
                    return 0;
                }
                return (prev as number) - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [timeLeft]);

    const handleAnswerChange = (qId: number, val: string) => {
        setAnswers(prev => ({ ...prev, [qId]: val }));
    };

    const normalizeType = (value: string) => (value || '').toLowerCase();
    const isMcType = (value: string) => ['mcq', 'mc', 'multiple_choice'].includes(normalizeType(value));
    const isTfType = (value: string) => ['tfng', 'tf', 'true_false', 'truefalse'].includes(normalizeType(value));
    const isGapType = (value: string) => ['gap', 'sentence_completion', 'cloze'].includes(normalizeType(value));
    const isMatchingType = (value: string) => ['matching'].includes(normalizeType(value));
    const isPhraseType = (value: string) => ['phrase_extraction'].includes(normalizeType(value));
    const isTableType = (value: string) => ['table', 'chart', 'table_chart'].includes(normalizeType(value));
    const stripQuestionPrefix = (text: string) => text.replace(/^\[.*?\]\s*/, '');
    const splitQuestionText = (text: string) => {
        const cleaned = (text || '').trim();
        const lines = cleaned.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (lines.length >= 2) {
            return { prompt: lines[0], body: lines.slice(1).join('\n') };
        }
        return { prompt: '', body: cleaned };
    };

    const parseAnswerArray = (value: string | undefined) => {
        if (!value) return [] as string[];
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    const renderGapInputs = (question: any, text: string, readOnly: boolean) => {
        const parts = text.split(/_{2,}/g);
        const blankCount = Math.max(parts.length - 1, 1);
        const stored = parseAnswerArray(answers[question.id]);
        const values = Array.from({ length: blankCount }, (_, idx) => stored[idx] || '');

        return (
            <div className="space-y-3">
                <div className="text-slate-800 whitespace-pre-wrap text-base font-semibold">
                    {parts.length > 1 ? (
                        parts.map((text: string, idx: number) => (
                            <span key={idx}>
                                {text}
                                {idx < blankCount && (
                                    <input
                                        className="inline-block mx-2 min-w-[140px] border-b-2 border-slate-300 focus:border-indigo-500 outline-none text-slate-900 bg-transparent text-base font-normal"
                                        readOnly={readOnly}
                                        value={values[idx]}
                                        onChange={(e) => {
                                            if (readOnly) return;
                                            const next = [...values];
                                            next[idx] = e.target.value;
                                            setAnswers(prev => ({ ...prev, [question.id]: JSON.stringify(next) }));
                                        }}
                                    />
                                )}
                            </span>
                        ))
                    ) : (
                        <input
                            className="w-full p-3 border border-slate-300 rounded-lg text-base font-normal"
                            readOnly={readOnly}
                            value={values[0]}
                            onChange={(e) => {
                                if (readOnly) return;
                                setAnswers(prev => ({ ...prev, [question.id]: JSON.stringify([e.target.value]) }));
                            }}
                            placeholder="Type your answer"
                        />
                    )}
                </div>
            </div>
        );
    };

    const parseMatchingOptions = (text: string) => {
        const options: string[] = [];
        const regex = /\b([A-E])\.\s*([\s\S]+?)(?=\s+[A-E]\.\s|$)/g;
        let match = regex.exec(text);
        while (match) {
            options.push(match[2].trim());
            match = regex.exec(text);
        }
        return options;
    };

    const parseMatchingItems = (text: string) => {
        const items: string[] = [];
        const regex = /(?:^|\s)(\d+|i{1,3}|iv|v|vi{0,3}|ix|x)\.\s*([\s\S]+?)(?=(?:\s+(?:\d+|i{1,3}|iv|v|vi{0,3}|ix|x)\.\s)|$)/gi;
        let match = regex.exec(text);
        while (match) {
            items.push(match[2].trim());
            match = regex.exec(text);
        }
        return items;
    };

    const parseMatchingData = (text: string, rawOptions?: string[]) => {
        const cleaned = (text || '').trim();
        let prompt = '';
        let body = cleaned;
        const split = splitQuestionText(cleaned);
        if (split.body) {
            prompt = split.prompt;
            body = split.body || cleaned;
        }

        let leftText = body;
        let rightText = '';
        const optionStart = body.match(/\bA\.\s/);
        if (optionStart && typeof optionStart.index === 'number') {
            leftText = body.slice(0, optionStart.index).trim();
            rightText = body.slice(optionStart.index).trim();
        }

        const firstItemMatch = leftText.match(/\b(\d+|i{1,3}|iv|v|vi{0,3}|ix|x)\.\s/i);
        if (!prompt && firstItemMatch && typeof firstItemMatch.index === 'number' && firstItemMatch.index > 0) {
            prompt = leftText.slice(0, firstItemMatch.index).trim();
            leftText = leftText.slice(firstItemMatch.index).trim();
        }

        const leftItems = parseMatchingItems(leftText);
        const derivedOptions = parseMatchingOptions(rightText);
        const options = (Array.isArray(rawOptions) && rawOptions.length > 0) ? rawOptions : derivedOptions;

        return {
            prompt,
            leftItems: leftItems.length > 0 ? leftItems : options.map((_, idx) => `Item ${idx + 1}`),
            options
        };
    };

    const renderMatching = (question: any, text: string, readOnly: boolean) => {
        const parsed = parseMatchingData(text, Array.isArray(question.options) ? question.options : undefined);
        const stored = parseAnswerArray(answers[question.id]);
        const values = Array.from({ length: parsed.leftItems.length }, (_, idx) => stored[idx] || '');

        return (
            <div className="space-y-4">
                {parsed.prompt && (
                    <div className="text-slate-700 whitespace-pre-wrap text-base">
                        {parsed.prompt}
                    </div>
                )}
                <div className="flex flex-wrap gap-2">
                    {parsed.options.map((opt: string, idx: number) => (
                        <div
                            key={idx}
                            draggable={!readOnly}
                            onDragStart={(e) => {
                                if (readOnly) return;
                                e.dataTransfer.setData('text/plain', opt);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-base text-slate-700 cursor-grab"
                        >
                            {String.fromCharCode(65 + idx)}. {opt}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {values.map((val: string, idx: number) => (
                        <div
                            key={idx}
                            className="border border-dashed border-slate-300 rounded-lg p-3 text-base text-slate-600 bg-slate-50"
                            onDragOver={(e) => {
                                if (readOnly) return;
                                e.preventDefault();
                            }}
                            onDrop={(e) => {
                                if (readOnly) return;
                                const dropped = e.dataTransfer.getData('text/plain');
                                const next = [...values];
                                next[idx] = dropped;
                                setAnswers(prev => ({ ...prev, [question.id]: JSON.stringify(next) }));
                            }}
                        >
                            <div className="text-sm text-slate-500 mb-1">{parsed.leftItems[idx] || `Slot ${idx + 1}`}</div>
                            <div className="font-medium text-slate-800 text-base">{val || 'Drop here'}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const parseTableRows = (text: string) => {
        const lines = text.split('\n');
        const tableLines = lines
            .map(line => line.trim())
            .filter(line => line.includes('|'))
            .filter(line => !/^\|?\s*:?[-]+:?(\s*\|\s*:?[-]+:?)+\s*\|?$/.test(line));

        if (tableLines.length < 2) {
            return null;
        }

        const rows = tableLines.map((line) => {
            const raw = line.replace(/^\|/, '').replace(/\|$/, '');
            return raw.split('|').map(cell => cell.trim());
        });

        return rows;
    };

    const renderTableQuestion = (question: any, text: string, readOnly: boolean) => {
        const rows = parseTableRows(text);
        if (!rows) {
            return <pre className="whitespace-pre-wrap text-slate-700 text-base">{text}</pre>;
        }

        const blankRegex = /_{2,}/g;
        const stored = parseAnswerArray(answers[question.id]);
        let blankIndex = 0;

        return (
            <table className="w-full border border-slate-200 text-base">
                <tbody>
                    {rows.map((row, rowIdx) => (
                        <tr key={rowIdx} className={rowIdx === 0 ? 'bg-slate-50 font-semibold' : ''}>
                            {row.map((cell, cellIdx) => {
                                const blanksHere = (cell.match(blankRegex) || []).length;
                                if (blanksHere === 0) {
                                    return (
                                        <td key={cellIdx} className="border border-slate-200 px-3 py-2">{cell}</td>
                                    );
                                }

                                const parts = cell.split(blankRegex);
                                const startIndex = blankIndex;
                                blankIndex += blanksHere;

                                return (
                                    <td key={cellIdx} className="border border-slate-200 px-3 py-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {parts.map((part, partIdx) => {
                                                const showInput = partIdx < blanksHere;
                                                const currentIndex = startIndex + partIdx;
                                                return (
                                                    <span key={partIdx} className="flex items-center gap-2">
                                                        {part && <span>{part}</span>}
                                                        {showInput && (
                                                            <input
                                                                className="min-w-[120px] border-b-2 border-slate-300 focus:border-indigo-500 outline-none text-slate-900 bg-transparent text-base"
                                                                readOnly={readOnly}
                                                                value={stored[currentIndex] || ''}
                                                                onChange={(e) => {
                                                                    if (readOnly) return;
                                                                    const next = [...stored];
                                                                    next[currentIndex] = e.target.value;
                                                                    setAnswers(prev => ({ ...prev, [question.id]: JSON.stringify(next) }));
                                                                }}
                                                            />
                                                        )}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    const renderAnswerInput = (question: any, text: string, readOnly: boolean) => {
        const myAns = answers[question.id];
        if (isMcType(question.question_type) && Array.isArray(question.options)) {
            return (
                <div className="space-y-3">
                    {question.options.map((opt: string, i: number) => {
                        const val = String.fromCharCode(65 + i);
                        const isSelected = myAns === val;
                        return (
                            <label
                                key={i}
                                className={`relative flex items-center p-4 rounded-lg cursor-pointer transition-all border ${
                                    isSelected
                                        ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600'
                                        : 'border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name={`q-${question.id}`}
                                    value={val}
                                    checked={isSelected}
                                    onChange={(e) => {
                                        if (readOnly) return;
                                        handleAnswerChange(question.id, e.target.value);
                                    }}
                                    disabled={readOnly}
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                />
                                <div className="ml-3 flex text-base items-center">
                                    <span className="font-semibold text-slate-500 w-6">{val}.</span>
                                    <span className={`text-base ${isSelected ? 'text-indigo-900 font-semibold' : 'text-slate-700'}`}>
                                        {opt}
                                    </span>
                                </div>
                            </label>
                        );
                    })}
                </div>
            );
        }

        if (isTfType(question.question_type)) {
            const options = [
                { label: 'True', value: 'T' },
                { label: 'False', value: 'F' },
                { label: 'Not Given', value: 'NG' }
            ];
            return (
                <div className="space-y-3">
                    {options.map((opt) => (
                        <label key={opt.value} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 text-base">
                            <input
                                type="radio"
                                name={`q-${question.id}`}
                                value={opt.value}
                                checked={myAns === opt.value}
                                onChange={(e) => {
                                    if (readOnly) return;
                                    handleAnswerChange(question.id, e.target.value);
                                }}
                                disabled={readOnly}
                            />
                            <span className="text-slate-700 font-medium text-base">{opt.label}</span>
                        </label>
                    ))}
                </div>
            );
        }

        if (isGapType(question.question_type)) {
            return renderGapInputs(question, text, readOnly);
        }

        if (isMatchingType(question.question_type)) {
            return renderMatching(question, text, readOnly);
        }

        if (isTableType(question.question_type)) {
            return (
                <div className="space-y-3">
                    {renderTableQuestion(question, text, readOnly)}
                </div>
            );
        }

        return (
            <textarea
                className={`w-full border border-slate-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 placeholder-slate-400 text-base ${
                    isPhraseType(question.question_type) ? 'min-h-[60px]' : 'min-h-[120px]'
                }`}
                placeholder="Type your answer here..."
                value={myAns || ''}
                onChange={(e) => {
                    if (readOnly) return;
                    handleAnswerChange(question.id, e.target.value);
                }}
                readOnly={readOnly}
            />
        );
    };

    const formatTime = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const remaining = seconds % 60;
        return `${minutes}:${String(remaining).padStart(2, '0')}`;
    };

    const submitPaper = async (force: boolean) => {
        if (isSubmitting) return;
        if (!force && !confirm("Are you sure you want to submit?")) return;
        
        setIsSubmitting(true);
        try {
            const payload = {
                answers: Object.entries(answers).map(([qId, val]) => ({
                    question_id: parseInt(qId),
                    answer: val
                }))
            };
            const res = await api.post(`/papers/${id}/submit`, payload);
            if (res.data.submission_id) {
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem(
                        `paper-${id}-submission-${res.data.submission_id}`,
                        JSON.stringify(answers)
                    );
                }
                router.replace(`/student/paper/${id}?submitted=1&submission_id=${res.data.submission_id}`);
            } else {
                router.push('/student/home');
            }
        } catch (err: any) {
            alert(err.response?.data?.message || "Submission failed");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!paper) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
                Loading paper...
            </div>
        );
    }

    return (
        <div
            className="min-h-screen bg-slate-50 font-sans"
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onPaste={(e) => e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
                {!isSubmittedView && needsFullscreen && (
                    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6">
                        <div className="bg-white rounded-xl p-6 max-w-md w-full text-center space-y-4">
                            <h2 className="text-lg font-semibold text-slate-900">Enter Fullscreen to Continue</h2>
                            <p className="text-sm text-slate-500">Fullscreen is required for this exam.</p>
                            <button
                                className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                                onClick={async () => {
                                    try {
                                        await document.documentElement.requestFullscreen();
                                    } catch (err) {
                                        alert('Fullscreen request was blocked. Please allow fullscreen and try again.');
                                    }
                                }}
                            >
                                Enter Fullscreen
                            </button>
                        </div>
                    </div>
                )}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <button
                            onClick={() => router.back()}
                            className="flex items-center text-slate-500 hover:text-slate-800 transition-colors text-sm font-medium"
                        >
                            <ArrowLeft size={16} className="mr-1" /> Exit
                        </button>
                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                            <FileText size={16} />
                            <span className="font-semibold text-slate-700">Reading Passage</span>
                        </div>
                        {timeLeft !== null && (
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                                timeLeft < 60 ? 'bg-red-50 text-red-700' : timeLeft < 300 ? 'bg-yellow-50 text-yellow-700' : 'bg-blue-50 text-blue-700'
                            }`}>
                                <Clock size={16} />
                                {formatTime(timeLeft)}
                            </div>
                        )}
                    </div>
                    <div className="p-6 prose prose-lg prose-slate max-w-none">
                        <div className="leading-relaxed text-slate-800 whitespace-pre-wrap font-serif select-none">
                            {paper.article_content || <span className="text-slate-400 italic">No Reference Material</span>}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">{paper.title}</h2>
                            <p className="text-sm text-slate-500">Answer the questions carefully</p>
                        </div>
                    </div>
                    <div className="p-6 space-y-6">
                        {isSubmittedView && (
                            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                                <Clock size={18} />
                                <span className="text-sm font-medium">已提交，正在批改中</span>
                            </div>
                        )}
                        {paper.questions.map((q: any, idx: number) => (
                            (() => {
                                const cleanedText = stripQuestionPrefix(q.question_text || '');
                                const inlineText = isGapType(q.question_type) || isMatchingType(q.question_type) || isTableType(q.question_type);
                                const split = splitQuestionText(cleanedText);
                                const questionText = inlineText ? (split.body || cleanedText) : cleanedText;
                                const headerText = inlineText ? (split.prompt || '') : cleanedText;

                                return (
                            <div key={q.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex gap-3 mb-4">
                                    <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-indigo-50 text-indigo-600 font-bold rounded-lg text-sm">
                                        {idx + 1}
                                    </span>
                                    {headerText && (
                                        <p className="text-slate-800 font-semibold pt-1 text-base select-none leading-relaxed">
                                            {headerText}
                                        </p>
                                    )}
                                </div>

                                <div className="ml-11 text-base">
                                    {renderAnswerInput(q, questionText, isSubmittedView)}
                                </div>
                            </div>
                                );
                            })()
                        ))}
                    </div>
                    {!isSubmittedView && (
                        <div className="p-4 bg-white border-t border-slate-200">
                            <button
                                onClick={() => submitPaper(false)}
                                disabled={isSubmitting}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
                            >
                                {isSubmitting ? (
                                    <>Submitting...</>
                                ) : (
                                    <>Submit Exam <Send size={18} /></>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
