
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../../utils/api';
import Link from 'next/link';
import { 
    Users, 
    ArrowLeft, 
    UserPlus, 
    Search,
    FileBarChart,
    Trash2,
    X,
    Loader2,
    ChevronRight
} from 'lucide-react';

export default function ClassDetails() {
    const router = useRouter();
    const { id } = router.query;
    const [students, setStudents] = useState<any[]>([]);
    const [newStudentName, setNewStudentName] = useState('');
    const [adding, setAdding] = useState(false);
    
    // Submission view state
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(false);

    useEffect(() => {
        if (id) loadStudents();
    }, [id]);

    const loadStudents = async () => {
        try {
            const res = await api.get(`/classes/${id}/students`);
            setStudents(res.data);
        } catch (err) {
            console.error("Failed to load students", err);
        }
    };

    const loadSubmissions = async (studentId: number) => {
        setLoadingSubmissions(true);
        try {
            const res = await api.get(`/papers/students/${studentId}/submissions`);
            setSubmissions(res.data);
        } catch (err) {
            console.error("Failed to load submissions", err);
            // alert("Failed to load submissions");
        } finally {
            setLoadingSubmissions(false);
        }
    };

    const handleViewSubmissions = (student: any) => {
        setSelectedStudent(student);
        loadSubmissions(student.id);
    }

    const handleCloseModal = () => {
        setSelectedStudent(null);
        setSubmissions([]);
    }

    const handleAddStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newStudentName.trim()) return;
        setAdding(true);
        try {
            await api.post(`/classes/${id}/students`, { username: newStudentName });
            setNewStudentName('');
            loadStudents();
            // alert("Student added!");
        } catch (err: any) {
            alert(err.response?.data?.detail || "Failed to add student. Ensure username exists.");
        } finally {
             setAdding(false);
        }
    };
    
    const removeStudent = async (studentId: number) => {
        if(!confirm("Remove student from this class?")) return;
        try {
            await api.delete(`/classes/${id}/students/${studentId}`);
            loadStudents();
        } catch(e) {
            console.error(e);
            alert("Failed to remove student");
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-5xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <Users size={32} className="text-indigo-600" /> Class Management
                        </h1>
                        <p className="text-gray-500 mt-2">Manage roster and view individual student performance.</p>
                    </div>
                    <Link href="/teacher/classes">
                        <button className="flex items-center gap-2 text-gray-600 hover:text-indigo-600 font-medium transition px-4 py-2 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 hover:shadow-sm">
                            <ArrowLeft size={18} /> Back to Classes
                        </button>
                    </Link>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Add Student Panel */}
                    <div className="lg:col-span-3 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <UserPlus size={20} className="text-indigo-500" /> Add Student to Class
                        </h3>
                        <form onSubmit={handleAddStudent} className="flex gap-4 items-center">
                            <div className="relative flex-1">
                                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input 
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    value={newStudentName} 
                                    onChange={e => setNewStudentName(e.target.value)} 
                                    placeholder="Enter Student Username"
                                />
                            </div>
                            <button 
                                type="submit" 
                                disabled={!newStudentName.trim() || adding}
                                className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 font-medium transition disabled:opacity-50 flex items-center gap-2 shadow-sm"
                            >
                                {adding ? <Loader2 size={18} className="animate-spin" /> : 'Add Student'}
                            </button>
                        </form>
                        <p className="mt-3 text-xs text-gray-500 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Note: Student must register an account first.
                        </p>
                    </div>

                    {/* Student List */}
                    <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                            <h3 className="font-bold text-gray-700">Student Roster</h3>
                            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-bold">
                                {students.length} Students
                            </span>
                        </div>
                        
                        {students.length === 0 ? (
                            <div className="p-12 text-center text-gray-400">
                                <Users size={48} className="mx-auto mb-4 text-gray-300" />
                                <p>No students in this class yet.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name / ID</th>
                                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {students.map(s => (
                                        <tr key={s.id} className="hover:bg-slate-50 transition group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs uppercase">
                                                        {s.username.substring(0, 2)}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-gray-900">{s.username}</div>
                                                        <div className="text-xs text-gray-500">ID: {s.id}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={() => handleViewSubmissions(s)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-md hover:bg-emerald-100 transition"
                                                    >
                                                        <FileBarChart size={14} /> Performance
                                                    </button>
                                                    <button 
                                                        onClick={() => removeStudent(s.id)}
                                                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                                                        title="Remove from Class"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* Submissions Modal */}
            {selectedStudent && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Student Performance</h3>
                                <p className="text-sm text-gray-500">{selectedStudent.username} (ID: {selectedStudent.id})</p>
                            </div>
                            <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                            {loadingSubmissions ? (
                                <div className="flex justify-center py-12">
                                     <Loader2 size={32} className="animate-spin text-indigo-600" />
                                </div>
                            ) : submissions.length === 0 ? (
                                <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200 border-dashed">
                                    <p>No submissions found for this student.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {submissions.map((sub:any) => (
                                        <Link key={sub.id} href={`/teacher/grading/${sub.id}`}>
                                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center hover:border-indigo-500 hover:ring-1 hover:ring-indigo-500 transition cursor-pointer group">
                                                <div>
                                                    <div className="font-medium text-gray-900 group-hover:text-indigo-600 transition-colors">Paper: {sub.paper_title}</div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        Submitted: {new Date(sub.submitted_at).toLocaleString()}
                                                    </div>
                                                </div>
                                                <div className="text-right flex items-center gap-4">
                                                    <div>
                                                        <div className={`text-xl font-bold ${
                                                            sub.score >= 80 ? 'text-green-600' : 
                                                            sub.score >= 60 ? 'text-amber-500' : 'text-red-500'
                                                        }`}>
                                                            {Math.round(sub.score)}%
                                                        </div>
                                                        <div className="text-[10px] uppercase font-bold text-gray-400">Score</div>
                                                    </div>
                                                    <ChevronRight size={18} className="text-gray-300 group-hover:text-indigo-500" />
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
