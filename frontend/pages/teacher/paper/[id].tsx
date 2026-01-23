import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../../utils/api';
import Link from 'next/link';

export default function TeacherViewPaper() {
    const router = useRouter();
    const { id } = router.query;
    const [paper, setPaper] = useState<any>(null);
    const [editingQ, setEditingQ] = useState<number | null>(null); // Track which question is being edited
    const [editData, setEditData] = useState<any>({});

    useEffect(() => {
        if (id) {
            loadPaper();
        }
    }, [id]);

    const loadPaper = () => {
        api.get(`/papers/${id}`).then(res => setPaper(res.data));
    };

    const startEdit = (q: any) => {
        setEditingQ(q.id);
        setEditData({ ...q });
    };

    const saveEdit = async () => {
        try {
            await api.put(`/papers/questions/${editingQ}`, {
                question_text: editData.question_text,
                options: editData.options,
                correct_answer: editData.correct_answer
            });
            setEditingQ(null);
            loadPaper(); // Refresh
        } catch (err) {
            alert("Failed to save changes");
        }
    };

    const handleOptionChange = (idx: number, val: string) => {
        const newOpts = [...(editData.options || [])];
        newOpts[idx] = val;
        setEditData({ ...editData, options: newOpts });
    };

    if (!paper) return <div style={{padding: '2rem'}}>Loading...</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <Link href="/teacher/papers"><button>← Back to My Papers</button></Link>
            </div>
            
            <h1>{paper.title}</h1>
            <div style={{ background: '#f9f9f9', padding: '1rem', marginBottom: '2rem' }}>
                <small>Paper ID: {paper.id}</small>
            </div>

            {paper.questions.map((q: any, idx: number) => {
                const isEditing = editingQ === q.id;
                
                return (
                    <div key={q.id} style={{ border: '1px solid #ddd', padding: '1.5rem', marginBottom: '1rem', borderRadius: '8px', background: isEditing ? '#fffcf0' : 'white' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <strong style={{ fontSize: '1.1rem' }}>Question {idx + 1}</strong>
                            <div>
                                <span style={{ background: '#eee', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', marginRight: '1rem' }}>
                                    {q.question_type.toUpperCase()}
                                </span>
                                {isEditing ? (
                                    <>
                                        <button onClick={saveEdit} style={{ background: 'green', color: 'white', marginRight: '0.5rem' }}>Save</button>
                                        <button onClick={() => setEditingQ(null)}>Cancel</button>
                                    </>
                                ) : (
                                    <button onClick={() => startEdit(q)}>Edit</button>
                                )}
                            </div>
                        </div>

                        {isEditing ? (
                            <textarea 
                                style={{ width: '100%', height: '100px', marginBottom: '1rem', padding: '0.5rem' }}
                                value={editData.question_text}
                                onChange={e => setEditData({...editData, question_text: e.target.value})}
                            />
                        ) : (
                            <p style={{ whiteSpace: 'pre-wrap', fontSize: '1.1rem', marginBottom: '1rem' }}>
                                {q.question_text}
                            </p>
                        )}

                        {q.question_type === 'mcq' && q.options && (
                            <div style={{ paddingLeft: '1rem', borderLeft: '3px solid #eee' }}>
                                {(isEditing ? editData.options : q.options).map((opt: string, i: number) => (
                                    <div key={i} style={{ padding: '0.25rem 0', display: 'flex', alignItems: 'center' }}>
                                        <span style={{ width: '20px' }}>{String.fromCharCode(65+i)}.</span> 
                                        {isEditing ? (
                                            <input 
                                                value={opt} 
                                                onChange={e => handleOptionChange(i, e.target.value)}
                                                style={{ flex: 1, padding: '0.2rem' }}
                                            />
                                        ) : opt}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f0fff4', borderRadius: '6px', border: '1px solid #c6f6d5' }}>
                            <strong style={{ color: '#2f855a' }}>✓ Correct Answer / Marking Scheme:</strong>
                            <div style={{ marginTop: '0.5rem', color: '#276749' }}>
                                {isEditing ? (
                                    <input 
                                        style={{ width: '100%', padding: '0.5rem' }}
                                        value={typeof editData.correct_answer === 'object' ? JSON.stringify(editData.correct_answer) : editData.correct_answer}
                                        onChange={e => setEditData({...editData, correct_answer: e.target.value})}
                                    />
                                ) : (
                                    typeof q.correct_answer === 'string' ? q.correct_answer : JSON.stringify(q.correct_answer)
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    )
}
