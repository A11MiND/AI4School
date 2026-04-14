import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { API_BASE_URL } from '../../utils/config';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { FileText, Upload, Trash2, Folder, FolderPlus, ChevronRight, Home, Loader2, FilePlus, Pencil, MoveRight, X } from 'lucide-react';

interface DocItem {
    id: number;
    title: string;
    is_folder: boolean;
    parent_id?: number | null;
    created_at: string;
    file_path?: string;
    visible?: boolean;
}

interface Breadcrumb {
    id: number | null;
    name: string;
}

interface FolderChoice {
    id: number;
    title: string;
}

export default function ContentLibrary() {
    const [documents, setDocuments] = useState<DocItem[]>([]);
    const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: 'Home' }]);
    const [classes, setClasses] = useState<any[]>([]);
    const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
    
    const [file, setFile] = useState<File | null>(null);
    const [uploadName, setUploadName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [showCreateFolder, setShowCreateFolder] = useState(false);
    const [renameDoc, setRenameDoc] = useState<DocItem | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [moveDoc, setMoveDoc] = useState<DocItem | null>(null);
    const [moveTargetId, setMoveTargetId] = useState<string>('');
    const [folders, setFolders] = useState<FolderChoice[]>([]);
    
    const router = useRouter();

    useEffect(() => {
        loadDocuments();
    }, [currentFolderId, selectedClassId]);

    useEffect(() => {
        loadClasses();
    }, []);

    const loadClasses = async () => {
        try {
            const res = await api.get('/classes/');
            setClasses(res.data);
            if (res.data.length > 0) {
                setSelectedClassId(res.data[0].id);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const loadDocuments = async () => {
        try {
            const params: Record<string, string | number> = {};
            if (currentFolderId) {
                params.parent_id = currentFolderId;
            }
            if (selectedClassId) {
                params.class_id = selectedClassId;
            }
            const res = await api.get('/documents/', { params });
            // Sort: Folders first, then Files
            const sorted = res.data.sort((a: DocItem, b: DocItem) => {
                if (a.is_folder === b.is_folder) return 0;
                return a.is_folder ? -1 : 1;
            });
            setDocuments(sorted);
        } catch (err) {
            console.error(err);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        if (uploadName.trim()) {
            formData.append('display_name', uploadName.trim());
        }
        if (currentFolderId) {
            formData.append('parent_id', currentFolderId.toString());
        }

        try {
             await api.post('/documents/upload', formData, {
                 headers: { 'Content-Type': 'multipart/form-data' }
             });
             setFile(null);
             setUploadName('');
             loadDocuments();
        } catch (err) {
            alert('Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            await api.post('/documents/create_folder', {
                name: newFolderName,
                parent_id: currentFolderId
            });
            setNewFolderName('');
            setShowCreateFolder(false);
            loadDocuments();
        } catch (err) {
            alert('Failed to create folder');
        }
    };

    const navigateToFolder = (folder: DocItem) => {
        setCurrentFolderId(folder.id);
        setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.title }]);
    };

    const navigateToBreadcrumb = (index: number) => {
        const target = breadcrumbs[index];
        setCurrentFolderId(target.id);
        setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    };

    const deleteItem = async (id: number) => {
        if (!confirm("Are you sure you want to delete this item?")) return;
        const hard = confirm("Permanently delete? (OK = hard delete, Cancel = soft delete)");
        try {
            await api.delete(`/documents/${id}`, { params: hard ? { hard: true } : undefined });
            loadDocuments();
        } catch (err) {
            alert("Delete failed");
        }
    };

    const updateVisibility = async (docId: number, visible: boolean) => {
        if (!selectedClassId) return;
        try {
            await api.post(`/documents/${docId}/visibility`, {
                class_id: selectedClassId,
                visible
            });
            setDocuments(prev => prev.map(doc => doc.id === docId ? { ...doc, visible } : doc));
        } catch (err) {
            alert('Failed to update visibility');
        }
    };

    const openRename = (doc: DocItem) => {
        setRenameDoc(doc);
        setRenameValue(doc.title);
    };

    const submitRename = async () => {
        if (!renameDoc || !renameValue.trim()) return;
        try {
            await api.patch(`/documents/${renameDoc.id}`, { title: renameValue.trim() });
            setRenameDoc(null);
            setRenameValue('');
            loadDocuments();
        } catch (err) {
            alert('Failed to rename item');
        }
    };

    const openMove = async (doc: DocItem) => {
        setMoveDoc(doc);
        setMoveTargetId(doc.parent_id == null ? '' : String(doc.parent_id));
        try {
            const res = await api.get('/documents/folders');
            const options = (res.data || []).filter((f: FolderChoice) => f.id !== doc.id);
            setFolders(options);
        } catch {
            setFolders([]);
        }
    };

    const submitMove = async () => {
        if (!moveDoc) return;
        const parent_id = moveTargetId === '' ? null : Number(moveTargetId);
        try {
            await api.post(`/documents/${moveDoc.id}/move`, { parent_id });
            setMoveDoc(null);
            setMoveTargetId('');
            loadDocuments();
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Failed to move item');
        }
    };

    return (
        <div className="space-y-6">
             <header className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Content Library</h1>
                    <p className="text-slate-500 text-sm">Manage your reading materials and folders.</p>
                </div>
             </header>

             <div className="flex flex-wrap gap-4 items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold uppercase text-slate-500">Class Visibility</label>
                    <select
                        className="border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-emerald-500 focus:ring-emerald-500"
                        value={selectedClassId ?? ''}
                        onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : null)}
                    >
                        <option value="">Select class...</option>
                        {classes.map((cls) => (
                            <option key={cls.id} value={cls.id}>{cls.name}</option>
                        ))}
                    </select>
                </div>
                {breadcrumbs.map((crumb, idx) => (
                    <div key={idx} className="flex items-center gap-2 whitespace-nowrap">
                        {idx > 0 && <ChevronRight size={16} className="text-slate-400" />}
                        <button 
                            onClick={() => navigateToBreadcrumb(idx)}
                            className={`flex items-center gap-1 text-sm font-medium ${idx === breadcrumbs.length - 1 ? 'text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            {idx === 0 && <Home size={14} />}
                            {crumb.name}
                        </button>
                    </div>
                ))}
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                 {/* Sidebar / Upload Zone */}
                 <div className="lg:col-span-1 space-y-4">
                    {/* Create Folder Box */}
                     <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <button 
                            onClick={() => setShowCreateFolder(!showCreateFolder)}
                            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition font-medium text-sm"
                        >
                            <FolderPlus size={16} /> New Folder
                        </button>
                        {showCreateFolder && (
                            <div className="mt-3 space-y-2">
                                <input 
                                    type="text" 
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    placeholder="Folder Name"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                    autoFocus
                                />
                                <button 
                                    onClick={handleCreateFolder}
                                    className="w-full py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700"
                                >
                                    Create
                                </button>
                            </div>
                        )}
                     </div>

                    {/* Upload Box */}
                    <div className="bg-white p-6 rounded-xl border border-dashed border-slate-300 text-center hover:bg-slate-50 transition-colors flex flex-col justify-center">
                        <div className="mx-auto flex justify-center text-emerald-500 mb-4 bg-emerald-50 p-3 rounded-full">
                            <Upload size={32} />
                        </div>
                        <h3 className="text-sm font-medium text-slate-900">Upload to current folder</h3>
                        <p className="text-slate-500 mb-6 text-xs">PDF, DOCX, TXT supported</p>
                        
                        <div className="w-full flex flex-col gap-3">
                            <input 
                                type="file" 
                                id="file-upload"
                                className="hidden"
                                onChange={e => setFile(e.target.files ? e.target.files[0] : null)} 
                            />
                            <label 
                                htmlFor="file-upload" 
                                className="cursor-pointer py-2 px-4 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 truncate"
                            >
                                {file ? file.name : "Select File"}
                            </label>
                            <input
                                type="text"
                                value={uploadName}
                                onChange={(e) => setUploadName(e.target.value)}
                                placeholder="Optional display name"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                            />
                            <button 
                                onClick={handleUpload} 
                                disabled={!file || uploading} 
                                className="py-2.5 px-4 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-sm"
                            >
                                {uploading ? <Loader2 className="animate-spin" size={16} /> : 'Upload'}
                            </button>
                        </div>
                    </div>
                 </div>

                 {/* File List */}
                 <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[500px]">
                     {documents.length === 0 ? (
                         <div className="flex flex-col items-center justify-center h-full text-slate-400">
                             <Folder size={48} className="mb-2 opacity-10" />
                             <p className="text-sm">Empty folder</p>
                         </div>
                     ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                            {documents.map((doc) => (
                                <div key={doc.id} className="group relative bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow cursor-default flex flex-col justify-between min-h-[192px] overflow-hidden">
                                     <div className="flex flex-col items-center flex-grow justify-center text-center cursor-pointer"
                                         onClick={() => doc.is_folder ? navigateToFolder(doc) : (doc.file_path && window.open(`${API_BASE_URL}/${doc.file_path}`, '_blank'))}>
                                        <div className={`p-3 rounded-xl mb-3 ${doc.is_folder ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'}`}>
                                            {doc.is_folder ? <Folder size={32} /> : <FileText size={32} />}
                                        </div>
                                        {/* CSS Fix: line-clamp instead of truncate to show more text */}
                                        <h3 className="font-medium text-slate-900 text-sm w-full break-words" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={doc.title}>
                                            {doc.title}
                                        </h3>
                                        <p className="text-xs text-slate-400 mt-2">
                                            {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Unknown Date'}
                                        </p>
                                    </div>

                                    <div className="mt-3 w-full flex items-center justify-between text-xs text-slate-500 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
                                        <span>Visible</span>
                                        <button
                                            className={`px-2 py-1 rounded-full border ${doc.visible ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                                            onClick={() => updateVisibility(doc.id, !(doc.visible ?? false))}
                                            disabled={!selectedClassId}
                                            title={selectedClassId ? 'Toggle visibility' : 'Select a class first'}
                                        >
                                            {doc.visible ? 'On' : 'Off'}
                                        </button>
                                    </div>
                                    
                                    <div className="flex justify-center gap-4 mt-2 pt-3 border-t border-slate-100 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
                                       <button
                                            title="Rename"
                                            onClick={(e) => { e.stopPropagation(); openRename(doc); }}
                                            className="text-slate-400 hover:text-blue-600 transition-colors"
                                        >
                                            <Pencil size={18} />
                                        </button>
                                       <button
                                            title="Move"
                                            onClick={(e) => { e.stopPropagation(); openMove(doc); }}
                                            className="text-slate-400 hover:text-violet-600 transition-colors"
                                        >
                                            <MoveRight size={18} />
                                        </button>
                                       {!doc.is_folder && (
                                            <button 
                                                title="Create Exam"
                                                onClick={(e) => { e.stopPropagation(); router.push(`/teacher/create-paper?docId=${doc.id}`); }}
                                                className="text-slate-400 hover:text-emerald-600 transition-colors"
                                            >
                                                <FilePlus size={18} />
                                            </button>
                                       )}
                                       <button 
                                            title="Delete"
                                            onClick={(e) => { e.stopPropagation(); deleteItem(doc.id); }}
                                            className="text-slate-400 hover:text-red-600 transition-colors"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                     )}
                 </div>
             </div>

             {renameDoc && (
                <div className="fixed inset-0 bg-black/35 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-slate-900">Rename Item</h3>
                            <button onClick={() => setRenameDoc(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setRenameDoc(null)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">Cancel</button>
                            <button onClick={submitRename} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm">Save</button>
                        </div>
                    </div>
                </div>
             )}

             {moveDoc && (
                <div className="fixed inset-0 bg-black/35 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-slate-900">Move Item</h3>
                            <button onClick={() => setMoveDoc(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <select
                            value={moveTargetId}
                            onChange={(e) => setMoveTargetId(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        >
                            <option value="">Root</option>
                            {folders.map((folder) => (
                                <option key={folder.id} value={String(folder.id)}>{folder.title}</option>
                            ))}
                        </select>
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setMoveDoc(null)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">Cancel</button>
                            <button onClick={submitMove} className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm">Move</button>
                        </div>
                    </div>
                </div>
             )}
        </div>
    );
}
