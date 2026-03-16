import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../../utils/api';
import { ArrowLeft } from 'lucide-react';
import { selectedMetricKeys, toFriendlyMetricLabel } from '../../../utils/metrics';

export default function GradingPage() {
    const router = useRouter();
    const { id } = router.query;
    const [submission, setSubmission] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) loadSubmission();
    }, [id]);

    const loadSubmission = async () => {
        try {
            const res = await api.get(`/papers/submissions/${id}`);
            setSubmission(res.data);
        } catch (err) {
            console.error(err);
            alert("Failed to load submission");
        } finally {
            setLoading(false);
        }
    };

    const handleScoreChange = async (answerId: number, newScore: number) => {
        if (Number.isNaN(newScore)) return;
        try {
            await api.put(`/papers/submissions/answers/${answerId}/score`, { score: newScore });
            // Reload to update total score
            loadSubmission(); 
        } catch (err) {
            console.error(err);
            alert("Failed to update score");
        }
    };

    if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
    if (!submission) return <div className="p-8 text-slate-500">Submission not found</div>;

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-5xl mx-auto space-y-6">
                <button onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800">
                    <ArrowLeft size={14} /> Back
                </button>

                <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <h1 className="text-2xl font-bold text-slate-900">Grading: {submission.paper_title}</h1>
                    <h2 className="text-slate-600 mt-1">Student: {submission.student_name}</h2>
                </div>

                <div className="sticky top-2 z-10 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                    <h3 className="text-slate-700 font-semibold">
                        Total Score: <span className="text-emerald-700 text-2xl align-middle ml-1">{submission.score}</span>
                    </h3>
                </div>

                <div className="space-y-4">
                    {submission.answers.map((ans: any, index: number) => {
                        const rubric = ans.rubric_scores || null;
                        const metrics = ans.writing_metrics || null;
                        const sentenceFeedback = Array.isArray(ans.sentence_feedback) ? ans.sentence_feedback : [];

                        return (
                            <div key={ans.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <h4 className="font-semibold text-slate-800">Q{index + 1}: {ans.question_text}</h4>
                                    <div className="text-xs text-slate-500">Answer ID: {ans.id}</div>
                                </div>

                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 mb-3">
                                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Student Answer</div>
                                    <pre className="whitespace-pre-wrap font-sans text-slate-800 m-0">{ans.answer || '-'}</pre>
                                </div>

                                {ans.selected_prompt && (
                                    <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100 mb-3">
                                        <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">Selected Task 2 Prompt</div>
                                        <div className="text-sm text-emerald-900">{ans.selected_prompt}</div>
                                    </div>
                                )}

                                {rubric && (
                                    <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100 mb-3 space-y-2">
                                        <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Rubric (C/L/O)</div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                            <div className="bg-white border border-emerald-100 rounded p-2 text-center">
                                                <div className="text-xs text-slate-500">Content</div>
                                                <div className="font-semibold text-emerald-700">{Number(rubric.content || 0).toFixed(1)}/7</div>
                                            </div>
                                            <div className="bg-white border border-emerald-100 rounded p-2 text-center">
                                                <div className="text-xs text-slate-500">Language</div>
                                                <div className="font-semibold text-emerald-700">{Number(rubric.language || 0).toFixed(1)}/7</div>
                                            </div>
                                            <div className="bg-white border border-emerald-100 rounded p-2 text-center">
                                                <div className="text-xs text-slate-500">Organization</div>
                                                <div className="font-semibold text-emerald-700">{Number(rubric.organization || 0).toFixed(1)}/7</div>
                                            </div>
                                            <div className="bg-white border border-emerald-100 rounded p-2 text-center">
                                                <div className="text-xs text-slate-500">Overall</div>
                                                <div className="font-semibold text-emerald-700">{Number(rubric.overall || 0).toFixed(1)}/7</div>
                                            </div>
                                        </div>
                                        {rubric.summary_feedback ? <p className="text-sm text-emerald-900">{rubric.summary_feedback}</p> : null}
                                    </div>
                                )}

                                {metrics && (
                                    <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100 mb-3 space-y-2">
                                        <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Linguistic Metrics (9)</div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {selectedMetricKeys.map((key) => (
                                                <div key={key} className="bg-white border border-emerald-100 rounded p-2">
                                                    <div className="text-xs text-slate-500">{toFriendlyMetricLabel(key)}</div>
                                                    <div className="text-sm font-semibold text-emerald-800">{Number(metrics[key] || 0).toFixed(4)}</div>
                                                </div>
                                            ))}
                                        </div>
                                        {metrics.hints && (
                                            <div className="space-y-1">
                                                <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Improvement Directions</div>
                                                {Object.entries(metrics.hints).map(([k, v]) => (
                                                    <p key={k} className="text-sm text-emerald-900"><span className="font-semibold">{toFriendlyMetricLabel(k)}:</span> {String(v)}</p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {sentenceFeedback.length > 0 && (
                                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 mb-3 space-y-2">
                                        <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Sentence-level Corrections</div>
                                        {sentenceFeedback.slice(0, 8).map((item: any, idx2: number) => (
                                            <div key={idx2} className="bg-white border border-amber-100 rounded p-3">
                                                <p className="text-sm text-slate-800"><span className="font-semibold">Sentence:</span> {item?.sentence || '-'}</p>
                                                <p className="text-sm text-slate-700"><span className="font-semibold">Issue:</span> {item?.issue || '-'}</p>
                                                <p className="text-sm text-amber-900"><span className="font-semibold">Suggestion:</span> {item?.suggestion || '-'}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-center gap-3 flex-wrap">
                                    <label className="text-sm font-semibold text-slate-700">Score:</label>
                                    <input
                                        type="number"
                                        defaultValue={ans.score}
                                        step="0.1"
                                        min="0"
                                        onBlur={(e) => handleScoreChange(ans.id, parseFloat(e.target.value))}
                                        className="px-2 py-1 border border-slate-300 rounded w-28"
                                    />
                                    <span className="text-sm text-slate-500">/ {ans.max_score}</span>
                                    {ans.word_count ? <span className="text-xs text-slate-500">Words: {ans.word_count}</span> : null}
                                    {ans.is_correct !== null && (
                                        <span className={`text-xs px-2 py-1 rounded border ${ans.is_correct ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-rose-700 bg-rose-50 border-rose-200'}`}>
                                            {ans.is_correct ? 'Auto-Correct Matches' : 'Auto-Correct Mismatch'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    )
}
