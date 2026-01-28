import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Plus, Bell, FileText, Calendar, Upload, BookOpen, BarChart } from 'lucide-react';

export default function TeacherHome() {
  const router = useRouter();

  useEffect(() => {
    // Auth Check
    const token = localStorage.getItem('teacher_token');
    if (!token) {
       router.push('/teacher/login');
    }
  }, []);

  return (
    <div className="space-y-8 p-8 max-w-7xl mx-auto min-h-screen bg-gray-50">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Teacher Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage your classes and assignments.</p>
        </div>
      </header>

      {/* Quick Actions Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        
        <Link href="/teacher/documents" className="block group">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group-hover:border-indigo-200 h-full">
            <div className="bg-indigo-50 w-12 h-12 rounded-lg flex items-center justify-center text-indigo-600 mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Upload size={24} />
            </div>
            <h3 className="font-semibold text-gray-800">Upload Content</h3>
            <p className="text-sm text-gray-500 mt-1">Upload reading materials.</p>
          </div>
        </Link>
        
        <Link href="/teacher/papers" className="block group">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group-hover:border-green-200 h-full">
            <div className="bg-green-50 w-12 h-12 rounded-lg flex items-center justify-center text-green-600 mb-4 group-hover:bg-green-600 group-hover:text-white transition-colors">
              <FileText size={24} />
            </div>
            <h3 className="font-semibold text-gray-800">Manage Papers</h3>
            <p className="text-sm text-gray-500 mt-1">View and assign exams.</p>
          </div>
        </Link>

        <Link href="/teacher/classes" className="block group">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group-hover:border-blue-200 h-full">
            <div className="bg-blue-50 w-12 h-12 rounded-lg flex items-center justify-center text-blue-600 mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <BookOpen size={24} />
            </div>
            <h3 className="font-semibold text-gray-800">My Classes</h3>
            <p className="text-sm text-gray-500 mt-1">Manage student rosters.</p>
          </div>
        </Link>
        
        <Link href="/teacher/analytics" className="block group">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group-hover:border-purple-200 h-full">
            <div className="bg-purple-50 w-12 h-12 rounded-lg flex items-center justify-center text-purple-600 mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <BarChart size={24} />
            </div>
            <h3 className="font-semibold text-gray-800">Analytics</h3>
            <p className="text-sm text-gray-500 mt-1">Class performance insights.</p>
          </div>
        </Link>

      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <section className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">System Status</h2>
            <div className="space-y-4">
                <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded-lg px-2 transition">
                  <div className="bg-green-100 p-2 rounded-full text-green-600">
                    <FileText size={16} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">Reading Paper Module</p>
                    <p className="text-xs text-green-600 font-semibold">Active & Ready</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded-lg px-2 transition">
                  <div className="bg-gray-100 p-2 rounded-full text-gray-400">
                    <Calendar size={16} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">Other Modules</p>
                    <p className="text-xs text-gray-500">Writing, Listening, Speaking coming soon.</p>
                  </div>
                </div>
            </div>
          </section>
        </div>

        <div>
           {/* Placeholder for future calendar/timeline */}
        </div>
      </div>
    </div>
  );
}
