
import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { 
    Users, 
    Plus, 
    Trash2, 
    ArrowRight, 
    School 
} from 'lucide-react';

export default function MyClasses() {
    const [classes, setClasses] = useState<any[]>([]);
    const [newClassName, setNewClassName] = useState('');
    const [creating, setCreating] = useState(false);
    const router = useRouter();

    useEffect(() => {
        loadClasses();
    }, []);

    const loadClasses = async () => {
        try {
            const res = await api.get('/classes/');
            setClasses(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreateClass = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!newClassName.trim()) return;
        
        setCreating(true);
        try {
            await api.post('/classes/', { name: newClassName });
            setNewClassName('');
            loadClasses();
        } catch (err) {
            alert("Failed to create class");
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteClass = async (id: number) => {
        if (confirm("Delete this class? All student memberships will be removed.")) {
            try {
                await api.delete(`/classes/${id}`);
                loadClasses();
            } catch (e) {
                alert("Failed to delete class");
            }
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">My Classes</h1>
                        <p className="text-gray-600 mt-2">Create classes and manage student enrollments.</p>
                    </div>
                </div>

                {/* Create Class Form */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Plus size={20} className="text-emerald-600" /> Create New Class
                    </h2>
                    <form onSubmit={handleCreateClass} className="flex gap-4">
                        <input 
                            type="text"
                            value={newClassName} 
                            onChange={e => setNewClassName(e.target.value)} 
                            placeholder="Ex: Grade 10 English - Section A"
                            className="flex-1 border-gray-300 rounded-lg shadow-sm focus:border-emerald-500 focus:ring-emerald-500 p-2.5 border"
                        />
                        <button 
                            type="submit" 
                            disabled={!newClassName.trim() || creating}
                            className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg hover:bg-emerald-700 transition font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {creating ? 'Creating...' : 'Create Class'}
                        </button>
                    </form>
                </div>

                {/* Classes Grid */}
                {classes.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-100 border-dashed">
                        <School size={48} className="mx-auto text-gray-300 mb-4" />
                        <p>No classes found. Create your first class above.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {classes.map(cls => (
                            <div key={cls.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col hover:shadow-md transition">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                                        <School size={24} />
                                    </div>
                                    <button 
                                        onClick={() => handleDeleteClass(cls.id)}
                                        className="text-gray-300 hover:text-red-500 transition p-1"
                                        title="Delete Class"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                                
                                <h3 className="text-xl font-bold text-gray-900 mb-2 truncate">{cls.name}</h3>
                                <p className="text-sm text-gray-500 mb-6">Class ID: <span className="font-mono bg-gray-100 px-1 rounded">{cls.id}</span></p>
                                
                                <div className="mt-auto">
                                    <Link href={`/teacher/class/${cls.id}`}>
                                        <button className="w-full py-2 px-4 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium rounded-lg transition flex items-center justify-center gap-2 group">
                                            Manage Students 
                                            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                                        </button>
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
