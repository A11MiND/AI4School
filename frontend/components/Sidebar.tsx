

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  Home, 
  BookOpen, 
  FileText, 
  Headphones, 
  PenTool, 
  Mic, 
  BarChart2, 
  GraduationCap,
  Settings,
  User,
  LogOut
} from 'lucide-react';
import axios from 'axios';

type MenuItem = {
  name: string;
  icon: any;
  path: string;
  wip?: boolean;
};

type UserProfile = {
  id: number;
  full_name?: string;
  username: string;
  avatar_url?: string;
  role: string;
}

const Sidebar = () => {
  const router = useRouter();
  const isStudent = router.pathname.startsWith('/student');
  const role = isStudent ? 'student' : 'teacher';
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem(role === 'student' ? 'student_token' : 'teacher_token');
      if (!token) return;
      
      try {
        const res = await axios.get('http://localhost:8000/users/me', {
            headers: { Authorization: `Bearer ${token}` }
        });
        setUser(res.data);
      } catch (err) {
        console.error("Failed to fetch profile", err);
      }
    };
    fetchProfile();
  }, [role]);

  const menuItems: MenuItem[] = role === 'student' ? [
    { name: 'Home', icon: Home, path: '/student/home' },
    { name: 'My Classes', icon: BookOpen, path: '/student/classroom' },
    { name: 'Reading Papers', icon: FileText, path: '/student/paper/reading' },
    { name: 'Writing Papers', icon: PenTool, path: '/student/paper/writing' },
    { name: 'Listening Papers', icon: Headphones, path: '/student/paper/listening' },
    { name: 'Speaking Papers', icon: Mic, path: '/student/paper/speaking' },
    { name: 'Reports', icon: BarChart2, path: '/student/report' },
    { name: 'Settings', icon: Settings, path: '/student/settings' },
  ] : [
    { name: 'Home', icon: Home, path: '/teacher/home' },
    { name: 'My Classes', icon: BookOpen, path: '/teacher/classes' },
    { name: 'Content Library', icon: BookOpen, path: '/teacher/documents' },
    { name: 'Reading', icon: FileText, path: '/teacher/papers' },
    { name: 'Writing', icon: PenTool, path: '/teacher/paper/writing', wip: true },
    { name: 'Listening', icon: Headphones, path: '/teacher/paper/listening', wip: true },
    { name: 'Speaking', icon: Mic, path: '/teacher/paper/speaking', wip: true },
    { name: 'Report', icon: BarChart2, path: '/teacher/analytics' }, 
    { name: 'Settings', icon: Settings, path: '/teacher/settings' },
  ];

  /* 
  // Specific menu adjustments for Teacher
  if (role === 'teacher') {
      // Find index or insert Document Management? 
      // Ideally "Reading Papers" covers the flow, but "Documents" is Step 1.
      // Let's add Content Library explicitly for clarity.
      const readingIndex = menuItems.findIndex(i => i.name === 'Reading Papers');
      menuItems.splice(readingIndex + 1, 0, { name: 'Content Library', icon: BookOpen, path: '/teacher/documents' });
  } 
  */


  const handleLogout = () => {
      // Clear specific role tokens
      if (role === 'teacher') {
          localStorage.removeItem('teacher_token');
          localStorage.removeItem('teacher_role');
      } else if (role === 'student') {
          localStorage.removeItem('student_token');
          localStorage.removeItem('student_role');
      }
      // Safety clear legacy
      localStorage.removeItem('token');
      localStorage.removeItem('role');

      router.push(`/${role}/login`);
  };

  return (
    <div className="w-64 h-screen bg-white border-r border-slate-200 flex flex-col sticky top-0 shrink-0 font-sans">
      {/* Brand */}
      <div className="h-16 flex items-center px-6 border-b border-slate-100">
        <Link href={`/${role}/home`} className="flex items-center gap-2 text-indigo-600 hover:opacity-80 transition">
            <GraduationCap size={28} />
            <span className="text-xl font-bold tracking-tight text-slate-900">AI4School</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        <div className="px-2 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {role.toUpperCase()} WORKSPACE
        </div>
        {menuItems.map((item) => {
          const isActive = router.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link 
              key={item.path}
              href={item.path}
              onClick={(e) => {
                 if (item.wip) {
                     e.preventDefault();
                     alert('Module coming soon!');
                 }
              }}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive 
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200' 
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              } ${item.wip ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Icon 
                size={18} 
                className={`transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`} 
              />
              {item.name}
            </Link>
          );
        })}
      </nav>
      
      {/* User Profile */}
      {user && (
        <div className="px-4 pb-2">
            <Link href={`/${role}/settings`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 transition-colors group">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden border border-indigo-200 shrink-0">
                    {user.avatar_url ? (
                        <img src={`http://localhost:8000/${user.avatar_url}`} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        <User size={20} className="text-indigo-600" />
                    )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-slate-900 truncate group-hover:text-indigo-700 transition-colors">
                        {user.full_name || user.username}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                        {user.username}
                    </p>
                </div>
            </Link>
        </div>
      )}

      {/* Footer / Logout */}
      <div className="p-4 border-t border-slate-100 bg-slate-50">
        <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-white hover:text-red-600 hover:shadow-sm transition-all border border-transparent hover:border-slate-200 group"
        >
            <div className="flex items-center gap-3">
                <LogOut size={18} className="text-slate-400 group-hover:text-red-500 transition-colors" />
                <span>Sign Out</span>
            </div>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
