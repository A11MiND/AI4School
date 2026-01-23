
import { useState, useEffect } from 'react';
import api from '../../utils/api';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
    FileText, 
    Trash2, 
    Calendar, 
    Users, 
    Clock, 
    RotateCcw,
    X,
    Check
} from 'lucide-react';

export default function MyPapers() {
    const [papers, setPapers] = useState<any[]>([]);
    const [classes, setClasses] = useState<any[]>([]);
    const [assignments, setAssignments] = useState<any[]>([]);
    const [selectedPaper, setSelectedPaper] = useState<number | null>(null);
    const [selectedClass, setSelectedClass] = useState<string>("");
    const [deadline, setDeadline] = useState("");
    const [duration, setDuration] = useState("");
    const [attempts, setAttempts] = useState("1");
    
    const router = useRouter();

    useEffect(() => {
        loadPapers();
        loadClasses();
        loadAssignments();
    }, []);

    const loadPapers = async () => {
        try {
            const res = await api.get('/papers/');
            setPapers(res.data);
        } catch (err) {
            console.error(err);
        }
    };
    
    const loadClasses = async () => {
        try {
            const res = await api.get('/classes/');
            setClasses(res.data);
        } catch (err) { }
    };

    const loadAssignments = async () => {
        try {
            const res = await api.get('/assignments/');
            setAssignments(res.data);
        } catch (err) { }
    };

    const openAssignModal = async (paperId: number) => {
        setSelectedPaper(paperId);
        setSelectedClass("");
        setDeadline("");
        setDuration("");
        setAttempts("1");
        try {
            const res = await api.get(`/assignments/paper/${paperId}`);
            setAssignments(res.data);
        } catch (e) {
            setAssignments([]);
        }
    };

    const handleRevoke = async (assignmentId: number) => {
        if (!confirm("Revoke this assignment? Students will lose access.")) return;
        try {
             await api.delete(`/assignments/${assignmentId}`);
             if (selectedPaper) openAssignModal(selectedPaper);
        } catch (e) {
            alert("Failed to revoke");
        }
    };

    const handleAssign = async () => {
        if (!selectedPaper || !selectedClass) return;
        
        try {
            await api.post('/assignments/', {
                paper_id: selectedPaper,
                class_id: parseInt(selectedClass),
                deadline: deadline ? new Date(deadline).toISOString() : null,
                duration_minutes: duration ? parseInt(duration) : null,
                max_attempts: attempts ? parseInt(attempts) : 1
            });
            openAssignModal(selectedPaper); // Reload list within modal
            setSelectedClass("");
            setDeadline("");
            setDuration("");
            setAttempts("1");
        } catch (e: any) {
            alert(e.response?.data?.message || "Assign failed");
        }
    };

    const handleDeletePaper = async (id: number) => {
        if(confirm('Delete paper? This action cannot be undone.')) {
            try {
                await api.delete(`/papers/${id}`);
                loadPapers();
            } catch (e) {
               console.error("Failed to delete", e);
            }
        }
    };

    const activePaperTitle = papers.find(p => p.id === selectedPaper)?.title || "Unknown Paper";

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">My Papers</h1>
                        <p className="text-gray-600 mt-2">Manage your exam papers and assign them to classes.</p>
                    </div>
                    <Link href="/teacher/create-paper">
                        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition flex items-center gap-2">
                           <FileText size={18} /> Create New Paper
                        </button>
                    </Link>
                </div>

                <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="p-4 text-sm font-semibold text-gray-600">Title</th>
                                <th className="p-4 text-sm font-semibold text-gray-600">Created At</th>
                                <th className="p-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {papers.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="p-8 text-center text-gray-500">
                                        No papers found. Create your first one to get started.
                                    </td>
                                </tr>
                            ) : (
                                papers.map(p => (
                                    <tr key={p.id} className="hover:bg-gray-50 transition">
                                        <td className="p-4 font-medium text-gray-900">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                                    <FileText size={20} />
                                                </div>
                                                {p.title}
                                            </div>
                                        </td>
                                        <td className="p-4 text-gray-500">
                                            {new Date(p.created_at).toLocaleDateString(undefined, {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button 
                                                    onClick={() => openAssignModal(p.id)}
                                                    className="px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-md hover:bg-emerald-100 transition flex items-center gap-1"
                                                >
                                                    <Users size={16} /> Assign
                                                </button>
                                                <Link href={`/teacher/create-paper?paperId=${p.id}`}>
                                                    <button className="px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-md hover:bg-indigo-100 transition flex items-center gap-1">
                                                        <FileText size={16} /> Edit
                                                    </button>
                                                </Link>
                                                <button 
                                                    onClick={() => handleDeletePaper(p.id)}
                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition"
                                                    title="Delete Paper"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Assignment Modal */}
            {selectedPaper && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Manage Assignments</h3>
                                <p className="text-sm text-gray-500 mt-1">Paper: {activePaperTitle}</p>
                            </div>
                            <button 
                                onClick={() => setSelectedPaper(null)}
                                className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Current Assignments List */}
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide flex items-center gap-2">
                                    <Users size={16} /> Current Assignments
                                </h4>
                                {assignments.length === 0 ? (
                                    <p className="text-sm text-gray-500 italic">This paper hasn't been assigned to any class yet.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {assignments.map(a => (
                                            <div key={a.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex justify-between items-center">
                                                <div>
                                                    <div className="font-semibold text-gray-900">{a.target_name}</div>
                                                    <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <Calendar size={12} /> Assigned: {new Date(a.assigned_at).toLocaleDateString()}
                                                            {a.deadline && (
                                                                <span className="text-orange-600 font-medium">
                                                                     · Due: {new Date(a.deadline).toLocaleString()}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                           {a.duration_minutes ? <><Clock size={12}/> {a.duration_minutes} mins</> : "Unlimited time"}
                                                           <span className="text-gray-300">|</span>
                                                           <RotateCcw size={12} /> {a.max_attempts} attempt{a.max_attempts > 1 ? 's' : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => handleRevoke(a.id)}
                                                    className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition text-sm font-medium"
                                                >
                                                    Revoke
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-gray-100 my-4"></div>

                            {/* New Assignment Form */}
                            <div>
                                <h4 className="text-lg font-bold text-gray-900 mb-4">Assign to New Class</h4>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Class</label>
                                        <select 
                                            className="w-full border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2.5 bg-white border"
                                            value={selectedClass} 
                                            onChange={e => setSelectedClass(e.target.value)}
                                        >
                                            <option value="">Choose a class...</option>
                                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Deadline (Optional)</label>
                                            <input 
                                                type="datetime-local" 
                                                className="w-full border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                                                value={deadline}
                                                onChange={e => setDeadline(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Minutes)</label>
                                            <input 
                                                type="number" 
                                                placeholder="e.g. 60" 
                                                className="w-full border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                                                value={duration}
                                                onChange={e => setDuration(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Max Attempts</label>
                                        <input 
                                            type="number" 
                                            defaultValue={1} 
                                            min={1} 
                                            className="w-full border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
                                            value={attempts}
                                            onChange={e => setAttempts(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                            <button 
                                onClick={() => setSelectedPaper(null)}
                                className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition"
                            >
                                Close
                            </button>
                            <button 
                                onClick={handleAssign} 
                                disabled={!selectedClass} 
                                className={`px-4 py-2 text-white font-medium rounded-lg transition flex items-center gap-2 ${
                                    !selectedClass 
                                    ? 'bg-gray-300 cursor-not-allowed' 
                                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-md'
                                }`}
                            >
                                <Check size={18} /> Confirm Assignment
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

