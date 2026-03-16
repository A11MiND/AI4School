import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../../utils/api';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle, Clock, Award, HelpCircle, AlertCircle } from 'lucide-react';
import { selectedMetricKeys, toFriendlyMetricLabel } from '../../../utils/metrics';

export default function StudentSubmissionView() {
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
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
    );
    
    if (!submission) return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
             <AlertCircle size={48} className="text-red-500 mb-4" />
             <h1 className="text-xl font-bold text-slate-800">Submission not found</h1>
             <Link href="/student/home" className="mt-4 text-indigo-600 hover:text-indigo-800 font-medium">
                Return to Dashboard
             </Link>
        </div>
    );

    const normalizeAnswer = (value: string | null | undefined) => {
        if (!value) return '';
        return value.replace(/^\[|\]$/g, '').replace(/"/g, '').trim();
    };

    const totalQuestions = submission.answers?.length || 0;
    const correctCount = submission.answers?.filter((ans: any) => ans.is_correct === true).length || 0;
    const hasWritingAnalysis = (submission.answers || []).some((ans: any) =>
        ans?.rubric_scores || ans?.writing_metrics || ans?.sentence_feedback
    );

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto space-y-6">
                

                {/* Header / Nav */}
                <div className="flex items-center justify-between">
                    <Link href="/student/home" className="flex items-center text-slate-500 hover:text-slate-800 transition-colors gap-1 text-sm font-medium">
                         <ArrowLeft size={16} /> Back to Dashboard
                    </Link>
                    <div className="text-xs text-slate-400 font-mono">
                        ID: {String(submission.id).slice(0, 8)}
                    </div>
                </div>

                {/* Score Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-indigo-600 px-8 py-8 text-white flex flex-col items-center justify-center relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-12 -mr-16 -mt-16 bg-white/10 rounded-full blur-3xl"></div>
                         <div className="absolute bottom-0 left-0 p-12 -ml-16 -mb-16 bg-black/10 rounded-full blur-3xl"></div>
                         
                         <h1 className="text-xl font-medium text-indigo-100 mb-2 relative z-10">{submission.paper_title}</h1>
                         {hasWritingAnalysis ? (
                            <div className="text-6xl font-extrabold tracking-tight relative z-10 flex items-baseline gap-2">
                                {typeof submission.score === 'number' ? Math.round(submission.score) : '--'}
                                <span className="text-2xl font-medium text-indigo-200">/ 100</span>
                            </div>
                         ) : (
                            <div className="text-6xl font-extrabold tracking-tight relative z-10 flex items-baseline gap-2">
                                {totalQuestions > 0 ? correctCount : '--'}
                                <span className="text-2xl font-medium text-indigo-200">/ {totalQuestions || '--'}</span>
                            </div>
                         )}
                         <div className="mt-4 flex items-center gap-2 text-indigo-200 text-sm relative z-10">
                              <Award size={16} /> Final Score
                         </div>
                    </div>

                    <div className="p-8">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-slate-800">Review Answers</h2>
                            {!hasWritingAnalysis && (
                                <div className="flex gap-4 text-sm text-slate-500">
                                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-green-500"></div> Correct</div>
                                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-red-500"></div> Incorrect</div>
                                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div> Unanswered</div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-6">
                            {submission.answers.map((ans: any, index: number) => {
                                const formattedAnswer = normalizeAnswer(ans.answer);
                                const hasAnswer = formattedAnswer.length > 0;
                                const isCorrect = ans.is_correct === true;
                                const isIncorrect = ans.is_correct === false && hasAnswer;
                                const isUnanswered = !hasAnswer;
                                const rubric = ans.rubric_scores || null;
                                const metrics = ans.writing_metrics || null;
                                const sentenceFeedback = Array.isArray(ans.sentence_feedback) ? ans.sentence_feedback : [];
                                const scoreColor = isCorrect === true ? 'text-green-600 bg-green-50 border-green-200' :
                                                   isIncorrect ? 'text-red-600 bg-red-50 border-red-200' :
                                                   'text-amber-600 bg-amber-50 border-amber-200';
                                
                                const Icon = isCorrect ? CheckCircle2 : isIncorrect ? XCircle : HelpCircle;

                                return (
                                    <div key={index} className="border border-slate-200 rounded-xl p-6 hover:shadow-md transition-shadow bg-white">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                 <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 font-bold rounded-lg text-sm">
                                                    {index + 1}
                                                 </span>
                                                 <h3 className="text-slate-800 font-medium">{ans.question_text.replace(/^\[.*?\]\s*/, '')}</h3>
                                            </div>
                                            {rubric ? (
                                                <div className="flex items-center justify-center gap-1 px-3 py-1 rounded-full text-xs font-bold border w-[130px] flex-shrink-0 text-indigo-700 bg-indigo-50 border-indigo-200">
                                                    <Award size={14} />
                                                    <span>{Number(rubric.overall || 0).toFixed(1)} / 7</span>
                                                </div>
                                            ) : (
                                                <div className={`flex items-center justify-center gap-1 px-3 py-1 rounded-full text-xs font-bold border w-[110px] flex-shrink-0 ${scoreColor}`}>
                                                    <Icon size={14} />
                                                    <span>{isCorrect ? 1 : 0} / 1 pt</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="ml-11">
                                            {ans.word_count ? (
                                                <div className="mb-2 text-xs text-slate-500 flex items-center gap-1">
                                                    <Clock size={12} /> Word count: {ans.word_count}
                                                </div>
                                            ) : null}

                                            {ans.selected_prompt ? (
                                                <div className="mb-2 p-3 bg-violet-50 rounded-lg border border-violet-100">
                                                    <div className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1">Selected Task 2 Prompt</div>
                                                    <div className="text-sm text-violet-900 whitespace-pre-wrap">{ans.selected_prompt}</div>
                                                </div>
                                            ) : null}

                                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Your Answer</div>
                                                <div className="text-slate-700 font-medium whitespace-pre-wrap">
                                                    {formattedAnswer || <span className="text-slate-400 italic">No answer provided</span>}
                                                </div>
                                            </div>

                                            {rubric && (
                                                <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-100 space-y-3">
                                                    <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Writing Quality (C/L/O)</div>
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                                        <div className="bg-white rounded border border-indigo-100 p-2 text-center">
                                                            <div className="text-slate-500 text-xs">Content</div>
                                                            <div className="font-semibold text-indigo-700">{Number(rubric.content || 0).toFixed(1)}/7</div>
                                                        </div>
                                                        <div className="bg-white rounded border border-indigo-100 p-2 text-center">
                                                            <div className="text-slate-500 text-xs">Language</div>
                                                            <div className="font-semibold text-indigo-700">{Number(rubric.language || 0).toFixed(1)}/7</div>
                                                        </div>
                                                        <div className="bg-white rounded border border-indigo-100 p-2 text-center">
                                                            <div className="text-slate-500 text-xs">Organization</div>
                                                            <div className="font-semibold text-indigo-700">{Number(rubric.organization || 0).toFixed(1)}/7</div>
                                                        </div>
                                                        <div className="bg-white rounded border border-indigo-100 p-2 text-center">
                                                            <div className="text-slate-500 text-xs">Overall</div>
                                                            <div className="font-semibold text-indigo-700">{Number(rubric.overall || 0).toFixed(1)}/7</div>
                                                        </div>
                                                    </div>
                                                    {rubric.summary_feedback ? (
                                                        <p className="text-sm text-indigo-900">{rubric.summary_feedback}</p>
                                                    ) : null}
                                                </div>
                                            )}

                                            {metrics && (
                                                <div className="mt-4 p-4 bg-emerald-50 rounded-lg border border-emerald-100 space-y-3">
                                                    <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Linguistic Metrics (9)</div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                        {selectedMetricKeys.map((key) => (
                                                            <div key={key} className="bg-white rounded border border-emerald-100 p-2">
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
                                                <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-100 space-y-2">
                                                    <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Sentence-level Corrections</div>
                                                    {sentenceFeedback.slice(0, 6).map((item: any, idx2: number) => (
                                                        <div key={idx2} className="bg-white rounded border border-amber-100 p-3 space-y-1">
                                                            <p className="text-sm text-slate-800"><span className="font-semibold">Sentence:</span> {item?.sentence || '-'}</p>
                                                            <p className="text-sm text-slate-700"><span className="font-semibold">Issue:</span> {item?.issue || '-'}</p>
                                                            <p className="text-sm text-amber-900"><span className="font-semibold">Suggestion:</span> {item?.suggestion || '-'}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            
                                            {/* Show correct answer if teacher allowed it */}
                                            {submission.show_answers && !isCorrect && ans.correct_answer && (
                                                <div className="mt-2 p-4 bg-green-50 rounded-lg border border-green-100">
                                                     <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Correct Answer</div>
                                                     <div className="text-green-800 font-medium whitespace-pre-wrap">{normalizeAnswer(ans.correct_answer)}</div>
                                                </div>
                                            )}
                                            
                                            {/* Show message when correct answer is hidden */}
                                            {!submission.show_answers && !isCorrect && (
                                                <div className="mt-2 p-3 bg-slate-100 rounded-lg border border-slate-200 text-center">
                                                     <div className="text-xs text-slate-500">Correct answer is not available for this paper</div>
                                                </div>
                                            )}
                                            
                                            {!hasWritingAnalysis && (ans.feedback || isUnanswered) && (
                                                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100 flex gap-3">
                                                    <div className="flex-shrink-0 mt-0.5 text-blue-500">
                                                        <HelpCircle size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Feedback</div>
                                                        <p className="text-sm text-blue-800">{ans.feedback || 'No answer submitted for this question.'}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
