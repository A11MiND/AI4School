import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../utils/api';
import Link from 'next/link';
import { 
    Clock, 
    Calendar, 
    Award, 
    ArrowRight, 
    PlayCircle,
    CheckCircle2,
    BookOpen
} from 'lucide-react';

export default function StudentHome() {
  const router = useRouter();
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Auth Check
  useEffect(() => {
    const token = localStorage.getItem('student_token');
    // const role = localStorage.getItem('student_role');
    if (!token) {
        router.push('/student/login'); 
    }
    fetchPapers();
  }, []);

  const fetchPapers = async () => {
      try {
          const res = await api.get('/papers/');
          setPapers(res.data);
      } catch (err) {
          console.error(err);
      } finally {
          setLoading(false);
      }
  };

  const activeAssignments = papers.filter(p => p.submitted_count < (p.max_attempts || 1));
  const completedAssignments = papers.filter(p => p.submitted_count > 0);

  return (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Student Dashboard</h1>
                <p className="text-gray-500 mt-2">Welcome back! Continue your learning journey.</p>
            </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content: Active Tasks */}
                <div className="lg:col-span-2 space-y-6">
                    <section>
                         <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                             <Clock size={20} className="text-indigo-600" /> To Do
                         </h2>
                         {loading ? (
                             <div className="h-40 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center text-gray-400">Loading...</div>
                         ) : activeAssignments.length === 0 ? (
                             <div className="bg-white rounded-xl p-8 border border-gray-100 text-center shadow-sm">
                                 <div className="bg-green-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600">
                                     <CheckCircle2 size={24} />
                                 </div>
                                 <h3 className="font-semibold text-gray-800">All Caught Up!</h3>
                                 <p className="text-sm text-gray-500">You have no pending assignments at the moment.</p>
                             </div>
                         ) : (
                             <div className="space-y-4">
                                 {activeAssignments.map(p => (
                                     <div key={p.assignment_id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow group flex items-start justify-between">
                                         <div>
                                             <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                                                 {p.title}
                                             </h3>
                                             <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 text-sm text-gray-500">
                                                 <span className="flex items-center gap-1.5"><Calendar size={14} /> Due: {p.deadline ? new Date(p.deadline).toLocaleDateString() : 'No Deadline'}</span>
                                                 <span className="flex items-center gap-1.5"><Clock size={14} /> Duration: {p.duration_minutes ? `${p.duration_minutes}m` : 'Unlimited'}</span>
                                                 <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-medium">Attempt {p.submitted_count + 1} of {p.max_attempts || 1}</span>
                                             </div>
                                         </div>
                                         <Link href={`/student/paper/${p.id}`}>
                                            <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition shadow-sm">
                                                Start <ArrowRight size={16} />
                                            </button>
                                         </Link>
                                     </div>
                                 ))}
                             </div>
                         )}
                    </section>
                </div>
                
                {/* Sidebar: Performance & History */}
                <div className="space-y-6">
                    <section className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                        <h2 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wide flex items-center justify-between">
                            <span>Recent Results</span>
                            <Award size={16} className="text-amber-500" />
                        </h2>
                        
                        {completedAssignments.length === 0 ? (
                            <p className="text-sm text-gray-400 italic">No completed papers yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {completedAssignments.slice(0, 5).map(p => (
                                    <Link key={p.assignment_id} href={`/student/submission/${p.latest_submission_id}`}>
                                        <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition border border-transparent hover:border-gray-100">
                                            <div className="overflow-hidden mr-3">
                                                <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                                                <p className="text-xs text-gray-500">{new Date().toLocaleDateString()}</p>
                                            </div>
                                            <div className={`font-bold text-sm ${
                                                (p.latest_score || 0) >= 80 ? 'text-green-600' : 'text-amber-600'
                                            }`}>
                                                {Math.round(p.latest_score) || 0}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                        <Link href="/student/report">
                            <button className="w-full mt-4 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition">
                                View Full Report
                            </button>
                        </Link>
                    </section>

                    <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-xl p-6 text-white relative overflow-hidden">
                        <div className="relative z-10">
                            <h3 className="font-bold text-lg mb-1">Study Tip</h3>
                            <p className="text-indigo-100 text-sm leading-relaxed">
                                Consistent reading practice improves comprehension speed by 20% over a month.
                            </p>
                        </div>
                        <div className="absolute top-0 right-0 p-8 -mr-4 -mt-4 bg-white/10 rounded-full blur-2xl"></div>
                    </div>
                </div>
            </div>
    </div>
  );
}
