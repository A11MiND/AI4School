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

interface ClassItem {
  id: number;
  name: string;
}

interface WeakAreaSkill {
  skill: string;
  errors: number;
  accuracy: number;
  total: number;
}

interface WeakAreaType {
  question_type: string;
  errors: number;
  accuracy: number;
  total: number;
}

interface WeakAreaPaper {
  paper_id: number;
  title: string;
  average_score: number;
  submissions: number;
}

interface WeakAreasResponse {
  skills: WeakAreaSkill[];
  question_types: WeakAreaType[];
  papers: WeakAreaPaper[];
  students: Array<StudentPerformance & {
    student_id?: number;
    weak_skills?: WeakAreaSkill[];
  }>;
}

export const sortWeakAreaStudents = (
  students: Array<StudentPerformance & { student_id?: number; weak_skills?: WeakAreaSkill[] }>,
  studentSort: 'avg_asc' | 'avg_desc' | 'exams_desc'
) => {
  return [...students].sort((a, b) => {
    if (studentSort === 'exams_desc') {
      return (b.exams_taken || 0) - (a.exams_taken || 0);
    }
    const diff = (a.average_score || 0) - (b.average_score || 0);
    return studentSort === 'avg_desc' ? -diff : diff;
  });
};

export const getQuestionTypeLabel = (value: string) => {
  const key = value?.toLowerCase?.() ?? '';
  const labels: Record<string, string> = {
    mc: 'Multiple Choice',
    mcq: 'Multiple Choice',
    tf: 'True / False / Not Given',
    tfng: 'True / False / Not Given',
    true_false: 'True / False',
    matching: 'Matching',
    gap: 'Gap Filling',
    sentence_completion: 'Sentence Completion',
    short_answer: 'Short Answer',
    phrase_extraction: 'Phrase Extraction',
    summary: 'Summary',
    open_ended: 'Open-ended',
    table: 'Table / Chart',
  };
  return labels[key] || value || 'Unknown';
};

const AnalyticsDashboard: React.FC = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [weakSkills, setWeakSkills] = useState<SkillData[]>([]);
  const [strugglingStudents, setStrugglingStudents] = useState<StudentPerformance[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [weakAreas, setWeakAreas] = useState<WeakAreasResponse | null>(null);
  const [studentSort, setStudentSort] = useState<'avg_asc' | 'avg_desc' | 'exams_desc'>('avg_asc');
  const [weakSkillSort, setWeakSkillSort] = useState<'errors_desc' | 'errors_asc'>('errors_desc');

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const res = await api.get('/classes');
        setClasses(res.data || []);
      } catch (error) {
        console.error('Failed to fetch classes:', error);
      }
    };

    fetchClasses();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const classParam = selectedClassId !== 'all' ? { class_id: selectedClassId } : undefined;
        const [overviewRes, skillsRes, studentsRes, weakAreasRes] = await Promise.all([
          api.get('/analytics/overview', { params: classParam }),
          api.get('/analytics/weak-skills', { params: classParam }),
          api.get('/analytics/student-performance', { params: classParam }),
          api.get('/analytics/weak-areas', { params: classParam }),
        ]);

        setOverview(overviewRes.data);
        setWeakSkills(skillsRes.data);
        setStrugglingStudents(studentsRes.data);
        setWeakAreas(weakAreasRes.data);
      } catch (error) {
        console.error('Failed to fetch analytics data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedClassId]);


  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-xl font-semibold">Loading Dashboard...</div>
      </div>
    );
  }

  const sortedWeakSkills = [...weakSkills].sort((a, b) => {
    const diff = a.errors - b.errors;
    return weakSkillSort === 'errors_desc' ? -diff : diff;
  });

  const sortedStudents = [...strugglingStudents].sort((a, b) => {
    if (studentSort === 'exams_desc') {
      return b.exams_taken - a.exams_taken;
    }
    const diff = a.average_score - b.average_score;
    return studentSort === 'avg_desc' ? -diff : diff;
  });

  const sortedWeakAreaStudents = sortWeakAreaStudents(weakAreas?.students || [], studentSort);

  const typeLabel = (value: string) => getQuestionTypeLabel(value);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap gap-4 justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Class Performance Analytics</h1>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600">Class</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="all">All Classes</option>
              {classes.map((cls) => (
                <option key={cls.id} value={String(cls.id)}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>
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
            <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Top Weak Knowledge Points</h2>
              <select
                value={weakSkillSort}
                onChange={(e) => setWeakSkillSort(e.target.value as 'errors_desc' | 'errors_asc')}
                className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="errors_desc">Most errors first</option>
                <option value="errors_asc">Fewest errors first</option>
              </select>
            </div>
            <div className="h-80">
              {sortedWeakSkills.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sortedWeakSkills} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
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
            {weakAreas?.skills?.length ? (
              <div className="mt-4 text-xs text-gray-500">
                Accuracy is calculated from total answers per skill.
              </div>
            ) : null}
          </div>

          {/* At-Risk Students Table */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Students Needing Attention</h2>
              <select
                value={studentSort}
                onChange={(e) => setStudentSort(e.target.value as 'avg_asc' | 'avg_desc' | 'exams_desc')}
                className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="avg_asc">Lowest avg first</option>
                <option value="avg_desc">Highest avg first</option>
                <option value="exams_desc">Most exams taken</option>
              </select>
            </div>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Top Weak Skills
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedStudents.length > 0 ? (
                    sortedStudents.map((student, idx) => (
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
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {(sortedWeakAreaStudents?.[idx]?.weak_skills || []).length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {(sortedWeakAreaStudents?.[idx]?.weak_skills || []).map((skill) => (
                                <span
                                  key={skill.skill}
                                  className="px-2 py-1 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-100"
                                >
                                  {skill.skill}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">No skill data</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                        No student data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Weak Question Types</h2>
            <div className="space-y-3 text-sm">
              {(weakAreas?.question_types || []).length > 0 ? (
                weakAreas?.question_types.map(item => (
                  <div key={item.question_type} className="rounded-lg border border-gray-100 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700">{typeLabel(item.question_type)}</span>
                      <span className="text-gray-500">{item.accuracy}%</span>
                    </div>
                    <div className="mt-2 w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${item.accuracy}%` }}></div>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">{item.errors} errors · {item.total} attempts</div>
                  </div>
                ))
              ) : (
                <div className="text-gray-400">No question-type data yet.</div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Lowest Performing Papers</h2>
            <div className="space-y-2 text-sm">
              {(weakAreas?.papers || []).length > 0 ? (
                weakAreas?.papers.map(paper => (
                  <div key={paper.paper_id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                    <div className="text-gray-700">{paper.title}</div>
                    <div className="text-gray-500">{paper.average_score}%</div>
                  </div>
                ))
              ) : (
                <div className="text-gray-400">No paper data yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
