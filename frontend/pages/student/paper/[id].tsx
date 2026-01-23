import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import api from '../../../utils/api';
import { Clock, ArrowLeft, Send, FileText, CheckCircle2 } from 'lucide-react';

export default function TakePaper() {
    const router = useRouter();
    const { id } = router.query;
    const [paper, setPaper] = useState<any>(null);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (id) {
            loadPaper();
        }
    }, [id]);

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
                return prev !== null ? prev - 1 : 0;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [timeLeft]);

    const handleAnswerChange = (qId: number, val: string) => {
        setAnswers(prev => ({ ...prev, [qId]: val }));
    };

    const submitPaper = async (force = false) => {
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
                router.replace(`/student/submission/${res.data.submission_id}`);
            } else {
                router.push('/student/home');
            }
        } catch (err: any) {
            alert(err.response?.data?.message || "Submission failed");
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    if (!paper) return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
    );

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
            {/* Left Panel: Article Content */}
            <div className="w-1/2 flex flex-col border-r border-slate-200 bg-white">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
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
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 prose prose-lg prose-slate max-w-none">
                     {/* Article text */}
                     <div className="leading-loose text-slate-800 whitespace-pre-wrap font-serif">
                        {paper.article_content || <span className="text-slate-400 italic">No Reference Material</span>}
                     </div>
                </div>
            </div>

            {/* Right Panel: Questions */}
            <div className="w-1/2 flex flex-col bg-slate-50">
                <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between sticky top-0 z-10">
                    <div>
                         <h1 className="text-lg font-bold text-slate-900 truncate max-w-md">{paper.title}</h1>
                         <p className="text-xs text-slate-500">Answer all questions</p>
                    </div>
                    {timeLeft !== null && (
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-mono font-medium border ${
                             timeLeft < 300 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                        }`}>
                            <Clock size={16} />
                            {formatTime(timeLeft)}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {paper.questions.map((q: any, idx: number) => {
                        const myAns = answers[q.id];
                        return (
                            <div key={q.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex gap-3 mb-4">
                                    <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-indigo-50 text-indigo-600 font-bold rounded-lg text-sm">
                                        {idx + 1}
                                    </span>
                                    <p className="text-slate-800 font-medium pt-1 text-lg">
                                        {q.question_text}
                                    </p>
                                </div>

                                {q.question_type === 'mcq' && q.options ? (
                                    <div className="ml-11 space-y-3">
                                        {q.options.map((opt: string, i: number) => {
                                            const val = String.fromCharCode(65+i);
                                            const isSelected = myAns === val;
                                            return (
                                                <label 
                                                    key={i} 
                                                    className={`relative flex items-center p-4 rounded-lg cursor-pointer transition-all border ${
                                                        isSelected 
                                                            ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600 z-10' 
                                                            : 'border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                                    }`}
                                                >
                                                    <input 
                                                        type="radio" 
                                                        name={`q-${q.id}`} 
                                                        value={val}
                                                        checked={isSelected}
                                                        onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                                    />
                                                    <div className="ml-3 flex text-base">
                                                        <span className="font-semibold text-slate-500 w-6">{val}.</span>
                                                        <span className={`font-medium ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>
                                                            {opt}
                                                        </span>
                                                    </div>
                                                </label>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="ml-11">
                                        <textarea 
                                            className="w-full p-4 border border-slate-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 placeholder-slate-400 min-h-[120px]"
                                            placeholder="Type your answer here..."
                                            value={myAns || ''}
                                            onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

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
            </div>
        </div>
    )
}
