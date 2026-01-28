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
    const [difficulty, setDifficulty] = useState('medium');
    const [assessmentObjectives, setAssessmentObjectives] = useState<string[]>([]);
    const [questionFormats, setQuestionFormats] = useState<string[]>([]);
    const [formatCounts, setFormatCounts] = useState<Record<string, number>>({
        mc: 0,
        tf: 0,
        gap: 0,
        matching: 0,
        short_answer: 0,
        phrase_extraction: 0,
        sentence_completion: 0,
        summary: 0,
        open_ended: 0,
        table: 0
    });
    const [markingStrictness, setMarkingStrictness] = useState('moderate');
    const [textType, setTextType] = useState('expository');
    const [register, setRegister] = useState('formal');
    const [cognitiveLoad, setCognitiveLoad] = useState('multi-skill');
    const [step, setStep] = useState(1);

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
                    setStep(3);
                })
                .catch(err => alert("Failed to load paper"))
                .finally(() => setLoading(false));
        }
    }, [docId, paperId]);

    const handleGenerate = async () => {
        if (!article) return alert("Please enter article text");
        setLoading(true);
        try {
            const res = await api.post('/papers/generate', {
                article_content: article,
                difficulty,
                assessment_objectives: assessmentObjectives,
                question_formats: questionFormats,
                question_format_counts: formatCounts,
                marking_strictness: markingStrictness,
                text_type: textType,
                register,
                cognitive_load: cognitiveLoad
            });
            // Clean AI data
            const cleanQuestions = res.data.map((q: any) => {
                let normalizedAnswer = q.correct_answer;
                if (typeof q.correct_answer === 'string') {
                    try {
                        JSON.parse(q.correct_answer);
                        normalizedAnswer = q.correct_answer;
                    } catch (e) {
                        normalizedAnswer = q.correct_answer.replace(/^\[|\]$/g, '').replace(/"/g, '');
                    }
                }

                return {
                    ...q,
                    question_text: q.question_text.replace(/^\[.*?\]\s*/, ''),
                    correct_answer: normalizedAnswer,
                    options: q.options?.map((opt: string) =>
                        opt.replace(/^\[|\]$/g, '').replace(/^"|"$/g, '')
                    )
                };
            });
            setQuestions(cleanQuestions);
            setStep(3);
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

    const toggleList = (list: string[], value: string, setter: (next: string[]) => void) => {
        if (list.includes(value)) {
            setter(list.filter(item => item !== value));
        } else {
            setter([...list, value]);
        }
    };

    const updateFormatCount = (format: string, value: string) => {
        const parsed = parseInt(value, 10);
        const nextValue = Number.isNaN(parsed) ? 0 : Math.max(parsed, 0);
        setFormatCounts(prev => ({
            ...prev,
            [format]: nextValue
        }));
        setQuestionFormats(prev => {
            if (nextValue > 0 && !prev.includes(format)) {
                return [...prev, format];
            }
            if (nextValue === 0 && prev.includes(format)) {
                return prev.filter(item => item !== format);
            }
            return prev;
        });
    };

    const adjustFormatCount = (format: string, delta: number) => {
        const current = formatCounts[format] ?? 0;
        const nextValue = Math.max(current + delta, 0);
        updateFormatCount(format, String(nextValue));
    };

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
            {/* Left Panel: Content Source */}
            <div className={`${step === 3 ? 'w-[60%] border-r border-slate-200' : 'w-full'} flex flex-col bg-white`}>
                 <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600">
                              <ArrowLeft size={20} />
                          </button>
                          <h2 className="font-bold text-slate-700 flex items-center gap-2">
                              <FileText size={18} className="text-indigo-500"/> Source Material
                          </h2>
                      </div>
                      <div className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                          Step {step} of 3
                      </div>
                 </div>
                 
                 <div className="p-6 flex-1 overflow-y-auto bg-slate-50/50">
                      {step === 1 && (
                          <div className="space-y-6 h-full flex flex-col">
                              <div>
                                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Paper Title</label>
                                  <input 
                                      className="w-full text-lg font-bold border-b-2 border-slate-200 bg-transparent py-2 focus:border-indigo-500 focus:outline-none placeholder-slate-300"
                                      value={title} 
                                      onChange={e => setTitle(e.target.value)} 
                                      placeholder="Enter Paper Title..."
                                  />
                              </div>

                              <div className="flex-1 flex flex-col min-h-0">
                                   <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Reading Passage (Preview & Edit)</label>
                                   <textarea 
                                        className="flex-1 w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none font-serif text-slate-700 leading-relaxed text-lg"
                                        value={article}
                                        onChange={e => setArticle(e.target.value)}
                                        placeholder="Paste or edit the reading passage here..."
                                   />
                              </div>
                          </div>
                      )}

                      {step === 2 && (
                          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                              <div className="flex items-center justify-between">
                                  <h3 className="text-sm font-semibold text-slate-700">Generation Options</h3>
                                  <span className="text-xs text-slate-400">Mix and match</span>
                              </div>

                              <div>
                                  <p className="text-xs font-semibold text-slate-500 mb-2">Difficulty</p>
                                  <div className="flex gap-2">
                                      {['easy', 'medium', 'hard'].map(level => (
                                          <button
                                              key={level}
                                              onClick={() => setDifficulty(level)}
                                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                                  difficulty === level
                                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                              }`}
                                          >
                                              {level.toUpperCase()}
                                          </button>
                                      ))}
                                  </div>
                              </div>

                              <div>
                                  <p className="text-xs font-semibold text-slate-500 mb-2">Assessment Objectives</p>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                      {[
                                          { label: 'Vocabulary in Context', value: 'vocabulary_in_context' },
                                          { label: 'Grammar & Structure', value: 'grammar_structure' },
                                          { label: 'Skimming', value: 'reading_skimming' },
                                          { label: 'Scanning', value: 'reading_scanning' },
                                          { label: 'Detailed Comprehension', value: 'reading_detail' },
                                          { label: 'Inference', value: 'reading_inference' },
                                          { label: 'Writer Attitude/Tone', value: 'reading_attitude' },
                                          { label: 'Main Idea & Support', value: 'reading_main_idea' },
                                          { label: 'Evaluation', value: 'critical_evaluation' },
                                          { label: 'Comparison', value: 'critical_comparison' },
                                          { label: 'Cause & Effect', value: 'critical_cause_effect' },
                                          { label: 'Paraphrase Recognition', value: 'exam_paraphrase' },
                                          { label: 'Distractor Handling', value: 'exam_distractor' }
                                      ].map(obj => (
                                          <button
                                              key={obj.value}
                                              onClick={() => toggleList(assessmentObjectives, obj.value, setAssessmentObjectives)}
                                              className={`px-2.5 py-1.5 rounded-lg border text-left transition ${
                                                  assessmentObjectives.includes(obj.value)
                                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                              }`}
                                          >
                                              {obj.label}
                                          </button>
                                      ))}
                                  </div>
                              </div>

                              <div>
                                  <p className="text-xs font-semibold text-slate-500 mb-2">Question Formats</p>
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                      {[
                                          { label: 'MC', value: 'mc' },
                                          { label: 'True/False/NG', value: 'tf' },
                                          { label: 'Gap Filling', value: 'gap' },
                                          { label: 'Matching', value: 'matching' },
                                          { label: 'Short Answer', value: 'short_answer' },
                                          { label: 'Phrase Extraction', value: 'phrase_extraction' },
                                          { label: 'Sentence Completion', value: 'sentence_completion' },
                                          { label: 'Summary', value: 'summary' },
                                          { label: 'Open-ended', value: 'open_ended' },
                                          { label: 'Table/Chart', value: 'table' }
                                      ].map(fmt => (
                                          <div key={`format-${fmt.value}`} className={`flex items-center justify-between gap-2 border rounded-lg px-3 py-2 ${
                                              (formatCounts[fmt.value] ?? 0) > 0
                                                  ? 'border-emerald-200 bg-emerald-50'
                                                  : 'border-slate-200 bg-white'
                                          }`}>
                                              <button
                                                  onClick={() => {
                                                      if ((formatCounts[fmt.value] ?? 0) > 0) {
                                                          updateFormatCount(fmt.value, '0');
                                                      } else {
                                                          updateFormatCount(fmt.value, '1');
                                                      }
                                                  }}
                                                  className={`flex-1 text-left text-slate-700 font-medium ${
                                                      (formatCounts[fmt.value] ?? 0) > 0 ? 'text-emerald-700' : 'text-slate-600'
                                                  }`}
                                              >
                                                  {fmt.label}
                                              </button>
                                              <div className="flex items-center gap-1">
                                                  <button
                                                      onClick={() => adjustFormatCount(fmt.value, -1)}
                                                      className="w-6 h-6 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                                                  >
                                                      -
                                                  </button>
                                                  <input
                                                      type="number"
                                                      min={0}
                                                      value={formatCounts[fmt.value] ?? 0}
                                                      onChange={e => updateFormatCount(fmt.value, e.target.value)}
                                                      className="w-12 text-center text-slate-700 border border-slate-200 rounded-md px-1 py-1 focus:border-emerald-500 focus:ring-emerald-500"
                                                  />
                                                  <button
                                                      onClick={() => adjustFormatCount(fmt.value, 1)}
                                                      className="w-6 h-6 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                                                  >
                                                      +
                                                  </button>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-xs font-semibold text-slate-500 mb-2">Marking Strictness</label>
                                      <select
                                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:border-emerald-500 focus:ring-emerald-500"
                                          value={markingStrictness}
                                          onChange={e => setMarkingStrictness(e.target.value)}
                                      >
                                          <option value="strict">Strict</option>
                                          <option value="moderate">Moderate</option>
                                          <option value="lenient">Lenient</option>
                                      </select>
                                  </div>
                                  <div>
                                      <label className="block text-xs font-semibold text-slate-500 mb-2">Cognitive Load</label>
                                      <select
                                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:border-emerald-500 focus:ring-emerald-500"
                                          value={cognitiveLoad}
                                          onChange={e => setCognitiveLoad(e.target.value)}
                                      >
                                          <option value="single-skill">Single-skill</option>
                                          <option value="multi-skill">Multi-skill</option>
                                      </select>
                                  </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-xs font-semibold text-slate-500 mb-2">Text Type</label>
                                      <select
                                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:border-emerald-500 focus:ring-emerald-500"
                                          value={textType}
                                          onChange={e => setTextType(e.target.value)}
                                      >
                                          <option value="article">Article</option>
                                          <option value="blog">Blog</option>
                                          <option value="report">Report</option>
                                          <option value="advertisement">Advertisement</option>
                                          <option value="narrative">Narrative</option>
                                          <option value="expository">Expository</option>
                                          <option value="argumentative">Argumentative</option>
                                      </select>
                                  </div>
                                  <div>
                                      <label className="block text-xs font-semibold text-slate-500 mb-2">Register</label>
                                      <select
                                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:border-emerald-500 focus:ring-emerald-500"
                                          value={register}
                                          onChange={e => setRegister(e.target.value)}
                                      >
                                          <option value="formal">Formal</option>
                                          <option value="semi-formal">Semi-formal</option>
                                          <option value="informal">Informal</option>
                                      </select>
                                  </div>
                              </div>
                          </div>
                      )}

                      {step === 3 && (
                          <div className="space-y-4">
                              <div>
                                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Paper Title</label>
                                  <input 
                                      className="w-full text-lg font-bold border-b-2 border-slate-200 bg-transparent py-2 focus:border-indigo-500 focus:outline-none placeholder-slate-300"
                                      value={title} 
                                      onChange={e => setTitle(e.target.value)} 
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Reading Passage (Confirmed)</label>
                                  <textarea 
                                      className="w-full h-[60vh] p-4 border border-slate-200 rounded-xl bg-slate-50 font-serif text-slate-700 leading-relaxed text-sm resize-none"
                                      value={article}
                                      onChange={e => setArticle(e.target.value)}
                                  />
                              </div>
                          </div>
                      )}
                 </div>

                 <div className="p-4 border-t border-slate-200 bg-white">
                      {step === 1 && (
                          <button
                              onClick={() => setStep(2)}
                              disabled={!article.trim()}
                              className="w-full py-3 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-sm transition-all disabled:opacity-70"
                          >
                              Next: Generation Options
                          </button>
                      )}

                      {step === 2 && (
                          <div className="flex gap-3">
                              <button
                                  onClick={() => setStep(1)}
                                  className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50"
                              >
                                  Back
                              </button>
                              <button 
                                  onClick={handleGenerate} 
                                  disabled={loading} 
                                  className="flex-1 py-3 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-sm transition-all disabled:opacity-70"
                              >
                                  {loading ? <RefreshCw className="animate-spin" size={20} /> : <Sparkles size={20} />}
                                  {loading ? "AI Generating..." : "Generate Questions"}
                              </button>
                          </div>
                      )}

                      {step === 3 && (
                          <div className="flex gap-3">
                              <button
                                  onClick={() => setStep(2)}
                                  className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50"
                              >
                                  Back to Options
                              </button>
                              <button
                                  onClick={() => setStep(1)}
                                  className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50"
                              >
                                  Edit Passage
                              </button>
                          </div>
                      )}
                 </div>
            </div>

            {step === 3 && (
            /* Right Panel: Generated Questions */
            <div className="w-[40%] flex flex-col bg-slate-50">
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

                                  {/* Answer UI by question type */}
                                  {(() => {
                                      const qType = (q.question_type || '').toLowerCase();
                                      let parsedAnswer: any = null;
                                      if (typeof q.correct_answer === 'string') {
                                          try {
                                              parsedAnswer = JSON.parse(q.correct_answer);
                                          } catch (e) {
                                              parsedAnswer = null;
                                          }
                                      }

                                      const cleanAnswer = Array.isArray(parsedAnswer)
                                          ? parsedAnswer.join(', ')
                                          : (parsedAnswer && typeof parsedAnswer === 'object' && parsedAnswer.answer)
                                              ? String(parsedAnswer.answer)
                                              : (q.correct_answer || '').replace(/^\[|\]$/g, '').replace(/"/g, '');

                                      const normalizeTfAnswer = (value: string) => {
                                          const normalized = (value || '').toString().trim().toLowerCase();
                                          if (['t', 'true'].includes(normalized)) return 'T';
                                          if (['f', 'false'].includes(normalized)) return 'F';
                                          if (['ng', 'not given', 'not_given'].includes(normalized)) return 'NG';
                                          return value;
                                      };

                                      if (qType === 'mcq' || qType === 'mc') {
                                          return (
                                              <>
                                                  <div className="space-y-2 mb-4">
                                                      {Array.isArray(q.options) ? q.options.map((opt, optIdx) => (
                                                          <div key={optIdx} className="flex items-center gap-2">
                                                              <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold ${
                                                                  String.fromCharCode(65 + optIdx) === cleanAnswer
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
                                                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-50">
                                                      <span className="text-xs font-semibold text-slate-400">Correct Answer:</span>
                                                      <div className="flex gap-2">
                                                          {q.options?.map((_, i) => {
                                                              const letter = String.fromCharCode(65 + i);
                                                              return (
                                                                  <button
                                                                      key={i}
                                                                      onClick={() => updateQuestion(idx, 'correct_answer', letter)}
                                                                      className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
                                                                          cleanAnswer === letter
                                                                          ? 'bg-green-500 text-white shadow-sm'
                                                                          : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                                                      }`}
                                                                  >
                                                                      {letter}
                                                                  </button>
                                                              );
                                                          })}
                                                      </div>
                                                  </div>
                                              </>
                                          );
                                      }

                                      if (qType === 'tf' || qType === 'tfng' || qType === 'true_false') {
                                          const tfAnswer = normalizeTfAnswer(parsedAnswer && typeof parsedAnswer === 'object' ? parsedAnswer.answer || cleanAnswer : cleanAnswer);
                                          const tfJustification = parsedAnswer && typeof parsedAnswer === 'object' ? parsedAnswer.justification || '' : '';
                                          return (
                                              <div className="mt-4 pt-4 border-t border-slate-50 space-y-3">
                                                  <div className="flex items-center gap-2">
                                                      <span className="text-xs font-semibold text-slate-400">Correct Answer:</span>
                                                      {['T', 'F', 'NG'].map(val => (
                                                          <button
                                                              key={val}
                                                              onClick={() => updateQuestion(idx, 'correct_answer', JSON.stringify({ answer: val, justification: tfJustification }))}
                                                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                                                  tfAnswer === val
                                                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                                                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                                              }`}
                                                          >
                                                              {val === 'NG' ? 'Not Given' : val}
                                                          </button>
                                                      ))}
                                                  </div>
                                                  <div>
                                                      <div className="text-xs font-semibold text-slate-400 mb-2">Sample Answer / Justification</div>
                                                      <input
                                                          className="w-full text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1"
                                                          value={tfJustification}
                                                          onChange={e => updateQuestion(idx, 'correct_answer', JSON.stringify({ answer: tfAnswer, justification: e.target.value }))}
                                                          placeholder="Why is it True/False/Not Given?"
                                                      />
                                                  </div>
                                              </div>
                                          );
                                      }

                                      if (qType === 'gap' || qType === 'sentence_completion') {
                                          return (
                                              <div className="mt-4 pt-4 border-t border-slate-50">
                                                  <div className="text-xs font-semibold text-slate-400 mb-2">Expected Answer</div>
                                                  <div className="flex items-center gap-2">
                                                      <div className="flex-1 border-b-2 border-dashed border-slate-300 h-6" />
                                                      <input
                                                          className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1"
                                                          value={cleanAnswer}
                                                          onChange={e => updateQuestion(idx, 'correct_answer', e.target.value)}
                                                          placeholder="Fill-in word/phrase"
                                                      />
                                                  </div>
                                              </div>
                                          );
                                      }

                                      if (qType === 'matching') {
                                          return (
                                              <div className="mt-4 pt-4 border-t border-slate-50 space-y-2">
                                                  <div className="text-xs font-semibold text-slate-400">Matching Options</div>
                                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                                      {(q.options || []).map((opt, optIdx) => (
                                                          <div key={optIdx} className="px-2 py-1 rounded border border-slate-200 bg-slate-50 text-slate-600">
                                                              {optIdx + 1}. {opt}
                                                          </div>
                                                      ))}
                                                  </div>
                                                  <div className="text-xs font-semibold text-slate-400">Correct Answer</div>
                                                  <input
                                                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded px-2 py-1"
                                                      value={cleanAnswer}
                                                      onChange={e => updateQuestion(idx, 'correct_answer', e.target.value)}
                                                      placeholder="e.g. 1->C, 2->A"
                                                  />
                                              </div>
                                          );
                                      }

                                      if (qType === 'table') {
                                          return (
                                              <div className="mt-4 pt-4 border-t border-slate-50">
                                                  <div className="text-xs font-semibold text-slate-400 mb-2">Table/Chart Completion</div>
                                                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 text-slate-500 text-xs">
                                                      Provide the table/chart blanks in the question text. Expected answers below.
                                                  </div>
                                                  <input
                                                      className="mt-2 w-full text-sm bg-white border border-slate-200 rounded px-2 py-1"
                                                      value={cleanAnswer}
                                                      onChange={e => updateQuestion(idx, 'correct_answer', e.target.value)}
                                                      placeholder="Expected answers / keywords"
                                                  />
                                              </div>
                                          );
                                      }

                                      return (
                                          <div className="mt-4 pt-4 border-t border-slate-50">
                                              <div className="text-xs font-semibold text-slate-400 mb-2">Expected Answer / Points</div>
                                              <textarea
                                                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded px-3 py-2 min-h-[96px]"
                                                  value={cleanAnswer}
                                                  onChange={e => updateQuestion(idx, 'correct_answer', e.target.value)}
                                                  placeholder="Key points or model answer"
                                              />
                                          </div>
                                      );
                                  })()}
                              </div>
                          ))
                      )}
                 </div>
                 
                 <div className="p-4 border-t border-slate-200 bg-white">
                      {step === 3 && (
                          <button 
                             onClick={handlePublish} 
                             disabled={publishing || questions.length === 0}
                             className="w-full py-3 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium shadow-sm transition-all disabled:opacity-70 disabled:grayscale"
                          >
                              {publishing ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                              Save & Publish Paper
                          </button>
                      )}
                 </div>
            </div>
            )}
        </div>
    );
}
