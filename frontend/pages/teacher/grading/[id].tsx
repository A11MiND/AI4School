import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../../utils/api';

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
        try {
            await api.put(`/submissions/answers/${answerId}/score`, { score: newScore });
            // Reload to update total score
            loadSubmission(); 
        } catch (err) {
            console.error(err);
            alert("Failed to update score");
        }
    };

    if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>;
    if (!submission) return <div style={{ padding: '2rem' }}>Submission not found</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
            <button onClick={() => router.back()} style={{ marginBottom: '1rem', cursor: 'pointer' }}>&larr; Back</button>
            <h1 style={{ marginBottom: '0.5rem' }}>Grading: {submission.paper_title}</h1>
            <h2 style={{ color: '#555', marginBottom: '1rem' }}>Student: {submission.student_name}</h2>
            
            <div style={{ 
                position: 'sticky', top: 0, background: 'white', padding: '1rem 0', 
                borderBottom: '1px solid #eee', marginBottom: '2rem', zIndex: 10 
            }}>
                <h3>Total Score: <span style={{ fontSize: '1.5em', color: '#0070f3' }}>{submission.score}</span></h3>
            </div>

            <div style={{ marginTop: '2rem' }}>
                {submission.answers.map((ans: any, index: number) => (
                    <div key={ans.id} style={{ 
                        border: '1px solid #ccc', padding: '1.5rem', marginBottom: '2rem', borderRadius: '8px',
                        background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}>
                        <h4 style={{ marginTop: 0 }}>Q{index + 1}: {ans.question_text}</h4>
                        <div style={{ margin: '1rem 0', padding: '1rem', background: '#f5f5f5', borderRadius: '4px', borderLeft: '4px solid #0070f3' }}>
                            <div style={{ fontSize: '0.9em', color: '#666', marginBottom: '0.5rem' }}>Student Answer:</div>
                            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{ans.answer}</pre>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <label><strong>Score:</strong></label>
                                <input 
                                    type="number" 
                                    defaultValue={ans.score}
                                    onBlur={(e) => handleScoreChange(ans.id, parseFloat(e.target.value))}
                                    style={{ padding: '8px', width: '100px', fontSize: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}
                                />
                                <span style={{ color: '#666' }}> / {ans.max_score}</span>
                            </div>

                            {ans.is_correct !== null && (
                                <span style={{ 
                                    padding: '4px 8px', borderRadius: '4px',
                                    background: ans.is_correct ? '#e6fffa' : '#fff5f5',
                                    color: ans.is_correct ? '#0070f3' : '#e53e3e',
                                    fontWeight: 'bold', fontSize: '0.9em'
                                }}>
                                    {ans.is_correct ? "Auto-Correct Matches" : "Auto-Correct Mismatch"}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
