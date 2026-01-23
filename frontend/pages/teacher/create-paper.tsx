import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useRouter } from 'next/router';
import { ArrowLeft, Sparkles, Save, RefreshCw, FileText, Check, AlertCircle, Loader2 } from 'lucide-react';

interface Question {
    question_text: string;
    question_type: string;
    options?: string[];
    correct_answer?: string;
}

export default function CreatePaper() {
    const router = useRouter();
    const { docId, paperId } = router.query;
    
    const [title, setTitle] = useState('');
    const [article, setArticle] = useState('');
    const [loading, setLoading] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [questions, setQuestions] = useState<Question[]>([]);

    // Mode: 'create' (from doc) or 'edit' (existing paper)
    const isEditMode = !!paperId;

    useEffect(() => {
        if (docId) {
            setLoading(true);
            api.get(`/documents/${docId}`)
               .then(res => {
                   setArticle(res.data.content || '');
                   setTitle(`Reading Exam: ${res.data.title}`);
               })
               .catch(err => alert("Failed to load document"))
               .finally(() => setLoading(false));
        } else if (paperId) {
            setLoading(true);
            api.get(`/papers/${paperId}`)
                .then(res => {
                    const p = res.data;
                    setTitle(p.title);
                    setArticle(p.article_content || ''); // Assuming backend returns this
                    setQuestions(p.questions || []);
                })
                .catch(err => alert("Failed to load paper"))
                .finally(() => setLoading(false));
        }
    }, [docId, paperId]);

    const handleGenerate = async () => {
        if (!article) return alert("Please enter article text");
        setLoading(true);
        try {
            const res = await api.post('/papers/generate', { article_content: article });
            // Clean AI data
            const cleanQuestions = res.data.map((q: any) => ({
                ...q,
                question_text: q.question_text.replace(/^\[.*?\]\s*/, ''),
                correct_answer: typeof q.correct_answer === 'string' 
                    ? q.correct_answer.replace(/^\[|\]$/g, '').replace(/"/g, '')
                    : q.correct_answer,
                 options: q.options?.map((opt: string) => 
                    opt.replace(/^\[|\]$/g, '').replace(/^"|"$/g, '')
                 )
            }));
            setQuestions(cleanQuestions);
        } catch (err) {
            alert("Generation failed");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handlePublish = async () => {
        if (!title || questions.length === 0) return alert("Missing title or questions");
        setPublishing(true);
        try {
            const payload = {
                title,
                article_content: article,
                questions
            };

            if (isEditMode) {
                await api.put(`/papers/${paperId}`, payload);
                alert("Paper Updated Successfully!");
            } else {
                await api.post('/papers/', payload);
                alert("Paper Published Successfully!");
            }
             
             router.push('/teacher/papers'); // Redirect to papers list
        } catch (err) {
            alert(isEditMode ? "Update failed" : "Publish failed");
        } finally {
            setPublishing(false);
        }
    };

    // Helper to update a specific question field
    const updateQuestion = (index: number, field: string, value: any) => {
        const newQs = [...questions];
        (newQs[index] as any)[field] = value;
        setQuestions(newQs);
    };
    
    // Helper to update option
    const updateOption = (qIndex: number, optIndex: number, val: string) => {
        const newQs = [...questions];
        if (newQs[qIndex].options) {
             newQs[qIndex].options![optIndex] = val;
             setQuestions(newQs);
        }
    };

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
            {/* Left Panel: Content Source */}
            <div className="w-1/2 flex flex-col border-r border-slate-200 bg-white">
                 <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600">
                              <ArrowLeft size={20} />
                          </button>
                          <h2 className="font-bold text-slate-700 flex items-center gap-2">
                              <FileText size={18} className="text-indigo-500"/> Source Material
                          </h2>
                      </div>
                 </div>
                 
                 <div className="p-6 flex-1 overflow-y-auto bg-slate-50/50">
                      <div className="mb-4">
                          <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Paper Title</label>
                          <input 
                              className="w-full text-lg font-bold border-b-2 border-slate-200 bg-transparent py-2 focus:border-indigo-500 focus:outline-none placeholder-slate-300"
                              value={title} 
                              onChange={e => setTitle(e.target.value)} 
                              placeholder="Enter Paper Title..."
                          />
                      </div>

                      <div className="h-full flex flex-col">
                           <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Reading Passage</label>
                           <textarea 
                                className="flex-1 w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none font-serif text-slate-700 leading-relaxed text-lg"
                                value={article}
                                onChange={e => setArticle(e.target.value)}
                                placeholder="Paste or edit the reading passage here..."
                           />
                      </div>
                 </div>

                 <div className="p-4 border-t border-slate-200 bg-white">
                      <button 
                         onClick={handleGenerate} 
                         disabled={loading} 
                         className="w-full py-3 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shadow-sm transition-all disabled:opacity-70"
                      >
                         {loading ? <RefreshCw className="animate-spin" size={20} /> : <Sparkles size={20} />}
                         {loading ? "AI Generating..." : "Generate Questions with AI"}
                      </button>
                 </div>
            </div>

            {/* Right Panel: Generated Questions */}
            <div className="w-1/2 flex flex-col bg-slate-50">
                 <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
                      <h2 className="font-bold text-slate-700">Questions Editor</h2>
                      <div className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded badge">
                          {questions.length} items
                      </div>
                 </div>

                 <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {questions.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400">
                               <Sparkles size={48} className="text-slate-300 mb-4" />
                               <p>Click "Generate" to create questions from the text.</p>
                          </div>
                      ) : (
                          questions.map((q, idx) => (
                              <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative group">
                                  <div className="absolute top-4 right-4 text-xs font-mono text-slate-300">Q{idx + 1}</div>
                                  
                                  {/* Question Text */}
                                  <div className="mb-4">
                                      <label className="block text-xs font-semibold text-slate-400 mb-1">Question</label>
                                      <input 
                                          className="w-full font-medium text-slate-800 border-b border-dashed border-slate-300 focus:border-indigo-500 focus:outline-none pb-1"
                                          value={q.question_text.replace(/^\[.*?\]\s*/, '')}
                                          onChange={e => updateQuestion(idx, 'question_text', e.target.value)}
                                      />
                                  </div>

                                  {/* MCQ Options */}
                                  {q.question_type === 'mcq' && q.options && (
                                       <div className="space-y-2 mb-4">
                                           {Array.isArray(q.options) ? q.options.map((opt, optIdx) => (
                                               <div key={optIdx} className="flex items-center gap-2">
                                                   <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold ${
                                                       String.fromCharCode(65 + optIdx) === q.correct_answer 
                                                       ? 'bg-green-100 text-green-700 border-green-200' 
                                                       : 'bg-slate-100 text-slate-500 border-slate-200'
                                                   }`}>
                                                       {String.fromCharCode(65 + optIdx)}
                                                   </div>
                                                   <input 
                                                       className="flex-1 text-sm text-slate-600 bg-transparent border-none focus:ring-0 p-0"
                                                       value={typeof opt === 'string' ? opt.replace(/^\[|\]$/g, '').replace(/^"|"$/g, '') : opt}
                                                       onChange={e => updateOption(idx, optIdx, e.target.value)}
                                                   />
                                               </div>
                                           )) : (
                                               <div className="text-red-500 text-sm">Error: Options format invalid</div>
                                           )}
                                       </div>
                                  )}

                                  {/* Correct Answer Selector */}
                                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-50">
                                      <span className="text-xs font-semibold text-slate-400">Correct Answer:</span>
                                      {q.question_type === 'mcq' ? (
                                           <div className="flex gap-2">
                                               {q.options?.map((_, i) => {
                                                   const letter = String.fromCharCode(65+i);
                                                   // Clean raw JSON array artifacts from rendered answer if present
                                                   const cleanAnswer = q.correct_answer?.replace(/^\[|\]$/g, '').replace(/"/g, '') || '';
                                                   
                                                   return (
                                                       <button 
                                                           key={i}
                                                           onClick={() => updateQuestion(idx, 'correct_answer', letter)}
                                                           className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
                                                               cleanAnswer === letter || q.correct_answer === letter
                                                               ? 'bg-green-500 text-white shadow-sm' 
                                                               : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                                           }`}
                                                        >
                                                            {letter}
                                                       </button>
                                                   )
                                               })}
                                           </div>
                                      ) : (
                                          <input 
                                              className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1"
                                              value={Array.isArray(q.correct_answer) ? q.correct_answer.join(', ') : (q.correct_answer || '').replace(/^\[|\]$/g, '').replace(/"/g, '')}
                                              onChange={e => updateQuestion(idx, 'correct_answer', e.target.value)}
                                              placeholder="Model answer..."
                                          />
                                      )}
                                  </div>
                              </div>
                          ))
                      )}
                 </div>
                 
                 <div className="p-4 border-t border-slate-200 bg-white">
                      <button 
                         onClick={handlePublish} 
                         disabled={publishing || questions.length === 0}
                         className="w-full py-3 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium shadow-sm transition-all disabled:opacity-70 disabled:grayscale"
                      >
                          {publishing ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                          Save & Publish Paper
                      </button>
                 </div>
            </div>
        </div>
    );
}
