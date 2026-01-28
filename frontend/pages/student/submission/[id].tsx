import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../../utils/api';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle, Clock, Award, HelpCircle, AlertCircle } from 'lucide-react';

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
                         <div className="text-6xl font-extrabold tracking-tight relative z-10 flex items-baseline gap-2">
                             {totalQuestions > 0 ? correctCount : "--"}
                             <span className="text-2xl font-medium text-indigo-200">/ {totalQuestions || "--"}</span>
                         </div>
                         <div className="mt-4 flex items-center gap-2 text-indigo-200 text-sm relative z-10">
                              <Award size={16} /> Final Score
                         </div>
                    </div>

                    <div className="p-8">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-slate-800">Review Answers</h2>
                            <div className="flex gap-4 text-sm text-slate-500">
                                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-green-500"></div> Correct</div>
                                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-red-500"></div> Incorrect</div>
                                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div> Unanswered</div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {submission.answers.map((ans: any, index: number) => {
                                const formattedAnswer = normalizeAnswer(ans.answer);
                                const hasAnswer = formattedAnswer.length > 0;
                                const isCorrect = ans.is_correct === true;
                                const isIncorrect = ans.is_correct === false && hasAnswer;
                                const isUnanswered = !hasAnswer;
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
                                            <div className={`flex items-center justify-center gap-1 px-3 py-1 rounded-full text-xs font-bold border w-[110px] flex-shrink-0 ${scoreColor}`}>
                                                <Icon size={14} />
                                                <span>{isCorrect ? 1 : 0} / 1 pt</span>
                                            </div>
                                        </div>

                                        <div className="ml-11">
                                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Your Answer</div>
                                                <div className="text-slate-700 font-medium whitespace-pre-wrap">
                                                    {formattedAnswer || <span className="text-slate-400 italic">No answer provided</span>}
                                                </div>
                                            </div>
                                            
                                            {/* Optional: Show correct answer if available and incorrect */}
                                            {/* 
                                            {!isCorrect && ans.correct_answer && (
                                                <div className="mt-2 p-4 bg-green-50 rounded-lg border border-green-100">
                                                     <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Correct Answer</div>
                                                     <div className="text-green-800 font-medium whitespace-pre-wrap">{ans.correct_answer}</div>
                                                </div>
                                            )} 
                                            */}
                                            
                                            {(ans.feedback || isUnanswered) && (
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
