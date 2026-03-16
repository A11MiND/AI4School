import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import api from '../../../../utils/api';
import { PenTool, Clock } from 'lucide-react';

type PaperRow = {
  id: number;
  title: string;
  paper_type?: string;
  assignment_id: number;
  status: 'pending' | 'completed';
  latest_score?: number;
  latest_submission_id?: number;
  deadline?: string;
  duration_minutes?: number;
};

export default function WritingPapers() {
  const [loading, setLoading] = useState(true);
  const [papers, setPapers] = useState<PaperRow[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/papers/');
        setPapers(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Failed to load papers', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const writingPapers = useMemo(
    () => papers.filter((paper) => (paper.paper_type || 'reading') === 'writing'),
    [papers]
  );

  if (loading) return <div className="p-8 text-center text-gray-500">Loading writing assignments...</div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Writing Papers</h1>
        <p className="text-gray-500">Practice your writing tasks.</p>
      </header>

      {writingPapers.length === 0 && (
        <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-500">No writing papers assigned yet.</p>
        </div>
      )}

      <div className="grid gap-4">
        {writingPapers.map((paper) => (
          <div key={`${paper.assignment_id ?? 'paper'}-${paper.id}`} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${paper.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-indigo-50 text-indigo-600'}`}>
                <PenTool size={22} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 text-lg">{paper.title}</h3>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                  {paper.deadline && <span className="flex items-center gap-1"><Clock size={14} /> Deadline: {paper.deadline}</span>}
                  {paper.status === 'completed' && (
                    typeof paper.latest_score === 'number' ? (
                      <span className="font-medium text-green-600">Score: {paper.latest_score.toFixed(1)}</span>
                    ) : (
                      <span className="font-medium text-amber-600">正在打分</span>
                    )
                  )}
                </div>
              </div>
            </div>

            <div>
              {paper.status === 'completed' && paper.latest_submission_id ? (
                <Link href={`/student/submission/${paper.latest_submission_id || paper.id}`}>
                  <button className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-200">
                    View Result
                  </button>
                </Link>
              ) : paper.status === 'completed' ? (
                <button className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg border border-amber-200 cursor-not-allowed" disabled>
                  正在打分
                </button>
              ) : (
                <Link href={`/student/paper/writing/${paper.id}?assignment_id=${paper.assignment_id}`}>
                  <button className="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition-colors">
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
