import Link from 'next/link';
import { GraduationCap, School, ArrowRight, BookOpen } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">
       {/* Navigation/Header - minimal */}
       <nav className="p-6">
          <div className="max-w-7xl mx-auto font-bold text-2xl text-indigo-600 tracking-tight flex items-center gap-2">
            <div className="p-2 bg-indigo-600 text-white rounded-lg">
                <BookOpen className="w-6 h-6" />
            </div>
            AI4School
          </div>
       </nav>

       {/* Main Content */}
       <main className="flex-grow flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center max-w-3xl mx-auto mb-16 animate-float">
            <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight mb-6">
              The Future of <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Smart Learning</span>
            </h1>
            <p className="text-xl text-slate-500 leading-relaxed max-w-2xl mx-auto">
              Experience the next generation of education management and AI-powered assessments. 
              Seamlessly connect teachers and students in one unified platform.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl w-full">
            {/* Student Card */}
            <Link href="/student/login" className="group">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-indigo-200 hover:translate-y-[-4px] transition-all duration-300 h-full flex flex-col items-center text-center cursor-pointer relative overflow-hidden">
                <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-500"></div>
                <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner">
                  <GraduationCap size={40} />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-3">Student Portal</h2>
                <p className="text-slate-500 mb-8 flex-grow leading-relaxed">
                  Access your assignments, take AI-graded exams, and track your learning progress with detailed analytics.
                </p>
                <div className="w-full py-3 px-4 bg-slate-50 text-blue-700 border border-blue-100 rounded-xl font-semibold flex items-center justify-center gap-2 group-hover:bg-blue-600 group-hover:text-white group-hover:border-transparent transition-all">
                  Login as Student <ArrowRight size={18} />
                </div>
              </div>
            </Link>

            {/* Teacher Card */}
            <Link href="/teacher/login" className="group">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-emerald-200 hover:translate-y-[-4px] transition-all duration-300 h-full flex flex-col items-center text-center cursor-pointer relative overflow-hidden">
                <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
                <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner">
                  <School size={40} />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-3">Teacher Portal</h2>
                <p className="text-slate-500 mb-8 flex-grow leading-relaxed">
                  Manage classes, create content, distribute assignments, and monitor student performance effortlessly.
                </p>
                <div className="w-full py-3 px-4 bg-slate-50 text-emerald-700 border border-emerald-100 rounded-xl font-semibold flex items-center justify-center gap-2 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-transparent transition-all">
                  Login as Teacher <ArrowRight size={18} />
                </div>
              </div>
            </Link>
          </div>
       </main>

       {/* Footer */}
       <footer className="py-8 text-center text-slate-400 text-sm border-t border-slate-100 mt-auto bg-white/50">
          © {new Date().getFullYear()} AI4School. Empowering Education with AI.
       </footer>
    </div>
  );
}
