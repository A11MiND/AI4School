import React, { useEffect, useState } from 'react';
import { FileText, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import api from '../../../../utils/api';

interface Paper {
  id: number;
  title: string;
  status: 'pending' | 'completed';
  latest_score?: number;
  deadline?: string;
  duration_minutes?: number;
}

export default function ReadingPapers() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPapers = async () => {
      try {
        const res = await api.get('/papers/');
        // Backend returns list structure: 
        // { id, title, assignment_id, deadline, duration_minutes, submitted_count, latest_score, status }
        setPapers(res.data);
      } catch (err) {
        console.error('Failed to load papers', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPapers();
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading assignments...</div>;

  return (
    <div className="space-y-6">
       <header className="flex justify-between items-end">
        <div>
           <h1 className="text-2xl font-bold text-gray-900">Reading Papers</h1>
           <p className="text-gray-500">Practice your reading comprehension skills.</p>
        </div>
      </header>
      
      {papers.length === 0 && (
          <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-500">No papers assigned yet.</p>
          </div>
      )}

      <div className="grid gap-4">
        {papers.map(paper => (
          <div key={paper.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${paper.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                <FileText size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 text-lg">{paper.title}</h3>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                   {paper.deadline && <span className="flex items-center gap-1"><Clock size={14} /> Deadline: {paper.deadline}</span>}
                   {paper.status === 'completed' && <span className="font-medium text-green-600">Score: {paper.latest_score?.toFixed(1) ?? 0}</span>}
                </div>
              </div>
            </div>

            <div>
              {paper.status === 'completed' ? (
                 <Link href={`/student/submission/${paper.latest_submission_id || paper.id}`}>
                    <button className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-200">
                      View Result
                    </button>
                 </Link>
              ) : (
                <Link href={`/student/paper/${paper.id}`}> 
                    <button className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-colors">
                      Start
                    </button>
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
