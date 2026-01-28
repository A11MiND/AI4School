import React, { useEffect, useState } from 'react';
import { Book, Folder, Download } from 'lucide-react';
import api from '../../utils/api';

export default function StudentClassroom() {
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      const selected = classes.find(c => c.id === selectedClassId);
      if (selected?.teacher_id) {
        fetchDocuments(selected.teacher_id, currentFolderId);
      }
    } else {
        setDocuments([]);
    }
  }, [selectedClassId, currentFolderId, classes]);

  const fetchClasses = async () => {
    try {
      const res = await api.get('/classes/');
      setClasses(res.data);
      if (res.data.length > 0) {
        setSelectedClassId(res.data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

    const fetchDocuments = async (_teacherId: number, folderId: number | null) => {
      try {
        const params: Record<string, number> = { class_id: selectedClassId as number };
        if (folderId) {
          params.parent_id = folderId;
        }
        const res = await api.get('/documents/', { params });
          setDocuments(res.data);
      } catch (err) {
          console.error("Failed to fetch documents", err);
      }
  };

    const handleDownload = (doc: any) => {
      window.open(`http://localhost:8000/documents/${doc.id}/download`, '_blank');
    };

  const selectedClass = classes.find(c => c.id === selectedClassId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">My Classroom</h1>
        <p className="text-gray-500">Access your course materials and resources.</p>
      </header>

      {/* Class Selector Tab */}
      <div className="flex gap-4 border-b border-gray-200 pb-1 overflow-x-auto">
        {classes.length > 0 ? (
           classes.map((cls) => (
            <button 
              key={cls.id}
              onClick={() => { setSelectedClassId(cls.id); setCurrentFolderId(null); }}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${selectedClassId === cls.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {cls.name}
            </button>
          ))
        ) : (
            <div className="px-4 py-2 text-sm text-gray-400">No classes enrolled.</div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm min-h-[400px]">
        <div className="p-6 border-b border-gray-50 flex justify-between items-center">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Folder size={18} className="text-yellow-500" /> 
                {currentFolderId ? (
                    <span className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentFolderId(null)}>
                        Root / ... 
                    </span>
                ) : "Course Materials"}
            </h2>
             {currentFolderId && (
                <button onClick={() => setCurrentFolderId(null)} className="text-sm text-blue-500 hover:underline">
                    Back to Root
                </button>
            )}
        </div>
        <div className="p-2">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="text-gray-400 text-xs border-b border-gray-50">
                        <th className="p-4 font-medium">Name</th>
                        <th className="p-4 font-medium">Type</th>
                        <th className="p-4 font-medium text-right">Size</th>
                        <th className="p-4 font-medium text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {documents.length === 0 && (
                        <tr><td colSpan={4} className="p-4 text-center text-gray-400">No materials found.</td></tr>
                    )}
                    {documents.map(doc => (
                        <tr key={doc.id} className="hover:bg-gray-50 group transition-colors">
                            <td className="p-4 text-sm text-gray-700 font-medium flex items-center gap-3 cursor-pointer" 
                                onClick={() => doc.is_folder ? setCurrentFolderId(doc.id) : handleDownload(doc)}>
                                {doc.is_folder ? (
                                    <Folder size={16} className="text-yellow-500" />
                                ) : (
                                    <Book size={16} className="text-blue-400" />
                                )}
                                {doc.title || doc.filename}
                            </td>
                            <td className="p-4 text-sm text-gray-500">{doc.is_folder ? 'Folder' : 'File'}</td>
                            <td className="p-4 text-sm text-gray-500 text-right">-</td>
                            <td className="p-4 text-right">
                                {!doc.is_folder && (
                                    <button className="text-gray-400 hover:text-blue-600" onClick={() => handleDownload(doc)}>
                                        <Download size={18} />
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}
