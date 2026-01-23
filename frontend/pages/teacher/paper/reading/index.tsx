import React from 'react';
import { FileText, Plus, Edit, Trash2, Users } from 'lucide-react';

const mockTeacherPapers = [
  { id: 1, title: 'Unit 1: Globalization', created: '2023-10-15', assignedTo: ['Class A', 'Class B'] },
  { id: 2, title: 'Unit 2: Technology', created: '2023-10-20', assignedTo: ['Class A'] },
];

export default function TeacherReadingPapers() {
  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Reading Papers</h1>
          <p className="text-gray-500">Create, edit, and assign reading assessments.</p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 shadow-sm">
          <Plus size={18} /> New Paper
        </button>
      </header>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/50">
                <tr className="text-gray-400 text-xs border-b border-gray-100">
                    <th className="p-5 font-medium">Title</th>
                    <th className="p-5 font-medium">Created</th>
                    <th className="p-5 font-medium">Assignments</th>
                    <th className="p-5 font-medium text-right">Actions</th>
                </tr>
            </thead>
            <tbody>
                {mockTeacherPapers.map(paper => (
                    <tr key={paper.id} className="hover:bg-gray-50 group border-b border-gray-50 last:border-0 transition-colors">
                        <td className="p-5">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-50 p-2 rounded text-blue-600">
                                   <FileText size={18} />
                                </div>
                                <span className="font-medium text-gray-700">{paper.title}</span>
                            </div>
                        </td>
                        <td className="p-5 text-sm text-gray-500">{paper.created}</td>
                        <td className="p-5">
                            <div className="flex gap-2">
                                {paper.assignedTo.map(cls => (
                                    <span key={cls} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md border border-gray-200">
                                        {cls}
                                    </span>
                                ))}
                                <button className="text-blue-600 text-xs hover:underline flex items-center gap-1 ml-1">
                                    <Plus size={12} /> Assign
                                </button>
                            </div>
                        </td>
                        <td className="p-5 text-right">
                           <div className="flex items-center justify-end gap-2">
                                <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit Content">
                                    <Edit size={16} />
                                </button>
                                <button className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                    <Trash2 size={16} />
                                </button>
                           </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
}
