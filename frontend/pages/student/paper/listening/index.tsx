import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Headphones, Clock } from 'lucide-react';
import api from '../../../../utils/api';

type PaperRow = {
  id: number;
  title: string;
  paper_type?: string;
  assignment_id: number;
  status: 'pending' | 'completed';
  latest_score?: number;
  latest_submission_id?: number;
  deadline?: string;
};

export default function ListeningPapers() {
  const [loading, setLoading] = useState(true);
  const [papers, setPapers] = useState<PaperRow[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/papers/');
        setPapers(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Failed to load listening papers', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const listeningPapers = useMemo(
    () => papers.filter((paper) => (paper.paper_type || 'reading') === 'listening'),
    [papers]
  );

  if (loading) return <div className="p-8 text-center text-gray-500">Loading listening assignments...</div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Listening Papers</h1>
        <p className="text-gray-500">Practice listening with transcript-aware exercises.</p>
      </header>

      {listeningPapers.length === 0 && (
        <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-500">No listening papers assigned yet.</p>
        </div>
      )}

      <div className="grid gap-4">
        {listeningPapers.map((paper) => (
          <div key={`${paper.assignment_id ?? 'paper'}-${paper.id}`} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${paper.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-cyan-50 text-cyan-600'}`}>
                <Headphones size={22} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 text-lg">{paper.title}</h3>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                  {paper.deadline && <span className="flex items-center gap-1"><Clock size={14} /> Deadline: {paper.deadline}</span>}
                  {paper.status === 'completed' && typeof paper.latest_score === 'number' && (
                    <span className="font-medium text-green-600">Score: {paper.latest_score.toFixed(1)}</span>
                  )}
                </div>
              </div>
            </div>

            <div>
              {paper.status === 'completed' && paper.latest_submission_id ? (
                <Link href={`/student/submission/${paper.latest_submission_id}`}>
                  <button className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-200">View Result</button>
                </Link>
              ) : (
                <Link href={`/student/paper/listening/${paper.id}?assignment_id=${paper.assignment_id}`}>
                  <button className="px-6 py-2 text-sm font-semibold text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 shadow-sm transition-colors">Start</button>
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
