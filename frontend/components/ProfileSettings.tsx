import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { User as UserIcon, Camera, Save, Lock, CheckCircle } from 'lucide-react';

interface ProfileSettingsProps {
  role: 'student' | 'teacher';
}

interface UserProfile {
  id: number;
  username: string;
  full_name: string;
  avatar_url: string;
  role: string;
  ai_provider?: string;
  ai_model?: string;
}

const ProfileSettings: React.FC<ProfileSettingsProps> = ({ role }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    full_name: '',
    username: '',
    password: '',
    confirm_password: '',
    ai_provider: 'deepseek',
    ai_model: 'deepseek-chat'
  });

  const providerOptions = [
    { value: 'deepseek', label: 'DeepSeek' },
    { value: 'qwen', label: 'Qwen' },
    { value: 'gemini', label: 'Gemini (Vertex)' }
  ];

  const modelOptions: Record<string, string[]> = {
    deepseek: ['deepseek-chat'],
    qwen: [
      'qwen-plus',
      'qwen3-max',
      'qwen-flash',
      'qwen-turbo'
    ],
    gemini: [
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ]
  };

  const getToken = () => localStorage.getItem(role === 'student' ? 'student_token' : 'teacher_token');
  const getStoredProvider = () => localStorage.getItem('ai_provider') || 'deepseek';
  const getStoredModel = (provider: string) => {
    const stored = localStorage.getItem('ai_model');
    if (stored && modelOptions[provider]?.includes(stored)) {
      return stored;
    }
    return modelOptions[provider]?.[0] || '';
  };


  const fetchProfile = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await axios.get('http://localhost:8000/users/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(res.data);
      setFormData(prev => ({
        ...prev,
        full_name: res.data.full_name || '',
        username: res.data.username || '',
        password: '',
        confirm_password: ''
      }));
    } catch (err) {
      console.error("Failed to fetch profile", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const provider = getStoredProvider();
    const model = getStoredModel(provider);
    setFormData(prev => ({
      ...prev,
      ai_provider: provider,
      ai_model: model
    }));
    fetchProfile();
  }, [role]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);

    try {
      setMessage(null);
      await axios.post('http://localhost:8000/users/me/avatar', formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      // Refresh profile to see new avatar
      fetchProfile();
      setMessage({ type: 'success', text: 'Avatar updated successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to upload avatar.' });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (formData.password && formData.password !== formData.confirm_password) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    setSaving(true);
    const token = getToken();
    try {
      const payload: any = {
        full_name: formData.full_name,
        username: formData.username
      };
      if (formData.password) {
        payload.password = formData.password;
      }

      await axios.put('http://localhost:8000/users/me', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      fetchProfile(); // Refresh data
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Failed to update profile.';
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('');
    const token = getToken();
    if (!token) {
      setTestStatus('error');
      setTestMessage('Please sign in again to test the connection.');
      return;
    }
    try {
      const res = await axios.post('http://localhost:8000/users/test-connection', {
        ai_provider: formData.ai_provider,
        ai_model: formData.ai_model
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTestStatus('success');
      setTestMessage(`Success: ${res.data.message}`);
    } catch (err: any) {
      setTestStatus('error');
      if (err.response?.status === 401) {
        setTestMessage('Unauthorized: please sign in again.');
      } else {
        setTestMessage(err.response?.data?.detail || 'Connection failed');
      }
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading profile...</div>;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className={`px-8 py-6 border-b border-slate-100 ${role === 'teacher' ? 'bg-emerald-50/50' : 'bg-indigo-50/50'}`}>
          <h1 className="text-2xl font-bold text-slate-800">Profile Settings</h1>
          <p className="text-slate-500 mt-1">Manage your account information and preferences</p>
        </div>

        <div className="p-8">
          {message && (
            <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
              message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {message.type === 'success' ? <CheckCircle size={18} /> : <CheckCircle size={18} className="rotate-180" />}
              {message.text}
            </div>
          )}

          <div className="flex flex-col items-center mb-8">
            <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
              <div className={`w-32 h-32 rounded-full overflow-hidden border-4 ${role === 'teacher' ? 'border-emerald-100' : 'border-indigo-100'} bg-slate-50`}>
                {user?.avatar_url ? (
                  <img src={`http://localhost:8000/${user.avatar_url}`} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <UserIcon size={64} />
                  </div>
                )}
              </div>
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="text-white" size={24} />
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange} 
            />
            <p className="mt-3 text-sm text-slate-500">Click to change avatar</p>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Display Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={e => setFormData({...formData, full_name: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  placeholder="e.g. John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Username (ID)</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            {role === 'teacher' && (
              <div className="pt-6 border-t border-slate-100">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  AI Model
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Provider</label>
                    <select
                      value={formData.ai_provider}
                      onChange={e => {
                        const provider = e.target.value;
                        const nextModel = modelOptions[provider]?.[0] || '';
                        localStorage.setItem('ai_provider', provider);
                        localStorage.setItem('ai_model', nextModel);
                        setFormData(prev => ({ ...prev, ai_provider: provider, ai_model: nextModel }));
                      }}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    >
                      {providerOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Model</label>
                    <select
                      value={formData.ai_model}
                      onChange={e => {
                        const model = e.target.value;
                        localStorage.setItem('ai_model', model);
                        setFormData(prev => ({ ...prev, ai_model: model }));
                      }}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    >
                      {modelOptions[formData.ai_provider]?.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Model IDs are aligned with the official Vertex AI and MaaS lists for stable use.
                    </p>
                  </div>
                </div>

                <div className="md:col-span-2 flex items-center mt-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testStatus === 'testing'}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 text-sm font-medium transition-colors"
                  >
                    {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>
                  {testMessage && (
                    <span className={`ml-3 text-sm ${testStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                      {testMessage}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Lock size={18} className="text-slate-400" />
                Security
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">New Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    placeholder="Leave blank to keep current"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Confirm Password</label>
                  <input
                    type="password"
                    value={formData.confirm_password}
                    onChange={e => setFormData({...formData, confirm_password: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-white font-medium shadow-sm transition-all ${
                  role === 'teacher' 
                    ? 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500' 
                    : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
                } focus:outline-none focus:ring-2 focus:ring-offset-2 ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <Save size={18} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettings;
