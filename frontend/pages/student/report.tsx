import React from 'react';
import { BarChart2, TrendingUp, AlertTriangle } from 'lucide-react';

export default function StudentReport() {
  return (
    <div className="space-y-6">
       <header>
        <h1 className="text-2xl font-bold text-gray-900">Learning Report</h1>
        <p className="text-gray-500">AI-powered analysis of your recent performance.</p>
      </header>

      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-8 text-white shadow-lg">
          <div className="flex items-start gap-4">
               <div className="bg-white/20 p-3 rounded-lg">
                    <TrendingUp size={24} className="text-white" />
               </div>
               <div>
                   <h2 className="text-xl font-bold mb-2">AI Summary</h2>
                   <p className="text-indigo-100 leading-relaxed">
                       "You have shown consistent improvement in Reading comprehension, particularly in inference questions.
                       However, vocabulary retention seems to be a weak point in recent papers. Consider reviewing Unit 3 word lists."
                   </p>
               </div>
          </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
             <h3 className="font-semibold text-gray-800 mb-6">Subject Performance</h3>
             {/* Simple visual bars */}
             <div className="space-y-4">
                 {[
                     { label: 'Reading', val: 85, color: 'bg-blue-500' },
                     { label: 'Listening', val: 72, color: 'bg-green-500' },
                     { label: 'Writing', val: 68, color: 'bg-yellow-500' },
                     { label: 'Speaking', val: 78, color: 'bg-purple-500' }
                 ].map(item => (
                     <div key={item.label}>
                         <div className="flex justify-between text-sm mb-1">
                             <span className="text-gray-600">{item.label}</span>
                             <span className="font-medium text-gray-900">{item.val}%</span>
                         </div>
                         <div className="w-full bg-gray-100 rounded-full h-2">
                             <div className={`${item.color} h-2 rounded-full`} style={{ width: `${item.val}%` }}></div>
                         </div>
                     </div>
                 ))}
             </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
             <h3 className="font-semibold text-gray-800 mb-6">Weak Areas</h3>
             <ul className="space-y-3">
                 {[
                     'Vocabulary: Synonyms matching',
                     'Listening: Multiple speakers identification',
                     'Writing: Paragraph cohesion'
                 ].map(weak => (
                     <li key={weak} className="flex items-center gap-3 text-gray-600 text-sm p-3 bg-red-50 rounded-lg border border-red-100">
                         <AlertTriangle size={16} className="text-red-500" />
                         {weak}
                     </li>
                 ))}
             </ul>
          </div>
      </div>
    </div>
  );
}
