import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../utils/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface OverviewData {
  total_submissions: number;
  average_score: number;
  active_students: number;
}

interface SkillData {
  skill: string;
  errors: number;
}

interface StudentPerformance {
  student: string;
  average_score: number;
  exams_taken: number;
}

const AnalyticsDashboard: React.FC = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [weakSkills, setWeakSkills] = useState<SkillData[]>([]);
  const [strugglingStudents, setStrugglingStudents] = useState<StudentPerformance[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [overviewRes, skillsRes, studentsRes] = await Promise.all([
          api.get('/analytics/overview'),
          api.get('/analytics/weak-skills'),
          api.get('/analytics/student-performance'),
        ]);

        setOverview(overviewRes.data);
        setWeakSkills(skillsRes.data);
        setStrugglingStudents(studentsRes.data);
      } catch (error) {
        console.error('Failed to fetch analytics data:', error);
        // If 401, interceptor handles it, otherwise maybe show error
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-xl font-semibold">Loading Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Class Performance Analytics</h1>
          <button
            onClick={() => router.push('/teacher/dashboard')}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-700"
          >
            &larr; Back to Dashboard
          </button>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Average Class Score</h3>
            <p className="mt-2 text-3xl font-semibold text-blue-600">
              {overview?.average_score ?? 0}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Total Submissions</h3>
            <p className="mt-2 text-3xl font-semibold text-green-600">
              {overview?.total_submissions ?? 0}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Active Students</h3>
            <p className="mt-2 text-3xl font-semibold text-purple-600">
              {overview?.active_students ?? 0}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Weak Skills Chart */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Top Weak Knowledge Points</h2>
            <div className="h-80">
              {weakSkills.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weakSkills} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="skill" type="category" width={100} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="errors" fill="#ef4444" name="Incorrect Answers" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  No error data available yet.
                </div>
              )}
            </div>
          </div>

          {/* At-Risk Students Table */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Students Needing Attention</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Student
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Exams Taken
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {strugglingStudents.length > 0 ? (
                    strugglingStudents.map((student, idx) => (
                      <tr key={idx}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {student.student}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            student.average_score < 60 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {student.average_score}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {student.exams_taken}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">
                        No student data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
