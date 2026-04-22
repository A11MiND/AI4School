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
import { toFriendlyMetricLabel } from '../../utils/metrics';

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

interface PaperFilterItem {
  id: number;
  title: string;
  paper_type: string;
}

interface StudentFilterItem {
  id: number;
  username: string;
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

interface SubjectBreakdownResponse {
  objective: {
    overall_accuracy: number;
    reading_accuracy: number;
    listening_accuracy: number;
    by_question_type: Array<{
      paper_type: string;
      question_type: string;
      accuracy: number;
      correct: number;
      total: number;
    }>;
  };
  productive: {
    overall_average_score: number;
    by_paper_type: Array<{
      paper_type: string;
      average_score: number;
      submissions: number;
    }>;
    rubric: {
      content: number;
      language: number;
      organization: number;
      overall: number;
    };
    metrics: Array<{
      key: string;
      value: number;
    }>;
  };
}

type DashboardViewConfig = {
  showOverview: boolean;
  showWeakSkills: boolean;
  showStudents: boolean;
  showQuestionTypes: boolean;
  showPapers: boolean;
  weakSkillsView: 'chart' | 'table';
  studentsView: 'table' | 'cards';
};

const DASHBOARD_VIEW_KEY = 'teacher_analytics_dashboard_view_v1';
const defaultSubjectBreakdown: SubjectBreakdownResponse = {
  objective: {
    overall_accuracy: 0,
    reading_accuracy: 0,
    listening_accuracy: 0,
    by_question_type: [],
  },
  productive: {
    overall_average_score: 0,
    by_paper_type: [],
    rubric: { content: 0, language: 0, organization: 0, overall: 0 },
    metrics: [],
  },
};
const defaultDashboardView: DashboardViewConfig = {
  showOverview: true,
  showWeakSkills: true,
  showStudents: true,
  showQuestionTypes: true,
  showPapers: true,
  weakSkillsView: 'chart',
  studentsView: 'table',
};

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
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedPaperId, setSelectedPaperId] = useState<string>('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('all');
  const [paperOptions, setPaperOptions] = useState<PaperFilterItem[]>([]);
  const [studentOptions, setStudentOptions] = useState<StudentFilterItem[]>([]);
  const [weakAreas, setWeakAreas] = useState<WeakAreasResponse | null>(null);
  const [studentSort, setStudentSort] = useState<'avg_asc' | 'avg_desc' | 'exams_desc'>('avg_asc');
  const [weakSkillSort, setWeakSkillSort] = useState<'errors_desc' | 'errors_asc'>('errors_desc');
  const [exporting, setExporting] = useState<null | 'csv' | 'pdf'>(null);
  const [showCustomize, setShowCustomize] = useState(false);
  const [dashboardView, setDashboardView] = useState<DashboardViewConfig>(defaultDashboardView);
  const [dashboardViewLoaded, setDashboardViewLoaded] = useState(false);
  const [subjectBreakdown, setSubjectBreakdown] = useState<SubjectBreakdownResponse>(defaultSubjectBreakdown);

  useEffect(() => {
    let mounted = true;
    const loadViewConfig = async () => {
      let loaded = false;
      try {
        const res = await api.get('/users/preferences/analytics_dashboard_view');
        const value = res?.data?.value;
        if (mounted && value && typeof value === 'object') {
          setDashboardView((prev) => ({ ...prev, ...value }));
          loaded = true;
        }
      } catch (err) {
        console.error('Failed to load dashboard view config from server', err);
      }

      if (!loaded && typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem(DASHBOARD_VIEW_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (mounted && parsed && typeof parsed === 'object') {
              setDashboardView((prev) => ({
                ...prev,
                ...parsed,
              }));
            }
          }
        } catch (err) {
          console.error('Failed to load dashboard view config from local cache', err);
        }
      }

      if (mounted) {
        setDashboardViewLoaded(true);
      }
    };

    loadViewConfig();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!dashboardViewLoaded || typeof window === 'undefined') return;
    window.localStorage.setItem(DASHBOARD_VIEW_KEY, JSON.stringify(dashboardView));
    const timer = window.setTimeout(() => {
      Promise.resolve(
        api.put('/users/preferences/analytics_dashboard_view', { value: dashboardView })
      ).catch((err) => {
        console.error('Failed to save dashboard view config to server', err);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [dashboardView, dashboardViewLoaded]);

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
        const params: Record<string, string> = {};
        if (selectedClassId !== 'all') params.class_id = selectedClassId;
        if (selectedSubject !== 'all') params.paper_type = selectedSubject;
        if (selectedPaperId !== 'all') params.paper_id = selectedPaperId;
        if (selectedStudentId !== 'all') params.student_id = selectedStudentId;
        const queryParams = Object.keys(params).length ? params : undefined;
        const [subjectRes, overviewRes, skillsRes, studentsRes, weakAreasRes] = await Promise.all([
          api.get('/analytics/subject-breakdown', { params: queryParams }),
          api.get('/analytics/overview', { params: queryParams }),
          api.get('/analytics/weak-skills', { params: queryParams }),
          api.get('/analytics/student-performance', { params: queryParams }),
          api.get('/analytics/weak-areas', { params: queryParams }),
        ]);

        const subjectData = subjectRes.data;
        setSubjectBreakdown(
          subjectData && typeof subjectData === 'object' && 'objective' in subjectData && 'productive' in subjectData
            ? subjectData
            : defaultSubjectBreakdown
        );
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
  }, [selectedClassId, selectedSubject, selectedPaperId, selectedStudentId]);

  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const params: Record<string, string> = {};
        if (selectedClassId !== 'all') params.class_id = selectedClassId;
        if (selectedSubject !== 'all') params.paper_type = selectedSubject;
        const queryParams = Object.keys(params).length ? params : undefined;
        const res = await api.get('/analytics/filter-options', { params: queryParams });
        setPaperOptions(Array.isArray(res.data?.papers) ? res.data.papers : []);
        setStudentOptions(Array.isArray(res.data?.students) ? res.data.students : []);
      } catch (error) {
        console.error('Failed to fetch analytics filter options:', error);
        setPaperOptions([]);
        setStudentOptions([]);
      }
    };

    fetchFilterOptions();
  }, [selectedClassId, selectedSubject]);

  useEffect(() => {
    if (selectedPaperId !== 'all' && !paperOptions.some((paper) => String(paper.id) === selectedPaperId)) {
      setSelectedPaperId('all');
    }
    if (selectedStudentId !== 'all' && !studentOptions.some((student) => String(student.id) === selectedStudentId)) {
      setSelectedStudentId('all');
    }
  }, [paperOptions, studentOptions, selectedPaperId, selectedStudentId]);

  const downloadAnalytics = async (format: 'csv' | 'pdf') => {
    try {
      setExporting(format);
      const params: Record<string, string> = {};
      if (selectedClassId !== 'all') params.class_id = selectedClassId;
      if (selectedSubject !== 'all') params.paper_type = selectedSubject;
      if (selectedPaperId !== 'all') params.paper_id = selectedPaperId;
      if (selectedStudentId !== 'all') params.student_id = selectedStudentId;
      const queryParams = Object.keys(params).length ? params : undefined;
      const res = await api.get(`/analytics/export.${format}`, {
        params: queryParams,
        responseType: 'blob',
      });
      const blob = new Blob([res.data], {
        type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/pdf',
      });
      const href = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      anchor.href = href;
      anchor.download = `analytics-${timestamp}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(href);
    } catch (error) {
      console.error('Failed to export analytics:', error);
      alert('Failed to export analytics');
    } finally {
      setExporting(null);
    }
  };

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
  const isObjectiveSubject = selectedSubject === 'reading' || selectedSubject === 'listening';
  const isProductiveSubject = selectedSubject === 'writing' || selectedSubject === 'speaking';
  const showObjectiveInsights = selectedSubject === 'all' || isObjectiveSubject;
  const showProductiveInsights = selectedSubject === 'all' || isProductiveSubject;
  const readingRows = subjectBreakdown.objective.by_question_type.filter((row) => row.paper_type === 'reading');
  const listeningRows = subjectBreakdown.objective.by_question_type.filter((row) => row.paper_type === 'listening');
  const writingRow = subjectBreakdown.productive.by_paper_type.find((row) => row.paper_type === 'writing');
  const speakingRow = subjectBreakdown.productive.by_paper_type.find((row) => row.paper_type === 'speaking');
  const objectiveCombined = subjectBreakdown.objective.by_question_type.reduce(
    (acc, row) => {
      const correct = Number(row.correct || 0);
      const total = Number(row.total || 0);
      return { correct: acc.correct + correct, total: acc.total + total };
    },
    { correct: 0, total: 0 }
  );
  const objectiveCombinedAccuracy = objectiveCombined.total > 0
    ? Number(((objectiveCombined.correct / objectiveCombined.total) * 100).toFixed(1))
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap gap-4 justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Class Performance Analytics</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => downloadAnalytics('csv')}
              disabled={exporting !== null}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50 disabled:opacity-60"
            >
              {exporting === 'csv' ? 'Exporting CSV...' : 'Export CSV'}
            </button>
            <button
              type="button"
              onClick={() => downloadAnalytics('pdf')}
              disabled={exporting !== null}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50 disabled:opacity-60"
            >
              {exporting === 'pdf' ? 'Exporting PDF...' : 'Export PDF'}
            </button>
            <button
              type="button"
              onClick={() => setShowCustomize((v) => !v)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50"
            >
              {showCustomize ? 'Hide Customize' : 'Customize View'}
            </button>
            <label className="text-sm font-medium text-gray-600">Class</label>
            <select
              aria-label="Class"
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setSelectedStudentId('all');
              }}
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

        {showCustomize && (
          <div className="bg-white rounded-lg border border-gray-100 p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-base font-semibold text-gray-800">Dashboard Layout</h2>
              <button
                type="button"
                onClick={() => setDashboardView(defaultDashboardView)}
                className="text-xs px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
              >
                Reset Default
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Visible Modules</p>
                <div className="space-y-2 text-sm text-gray-700">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={dashboardView.showOverview} onChange={(e) => setDashboardView((prev) => ({ ...prev, showOverview: e.target.checked }))} />
                    Overview Cards
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={dashboardView.showWeakSkills} onChange={(e) => setDashboardView((prev) => ({ ...prev, showWeakSkills: e.target.checked }))} />
                    Weak Knowledge Points
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={dashboardView.showStudents} onChange={(e) => setDashboardView((prev) => ({ ...prev, showStudents: e.target.checked }))} />
                    Students Needing Attention
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={dashboardView.showQuestionTypes} onChange={(e) => setDashboardView((prev) => ({ ...prev, showQuestionTypes: e.target.checked }))} />
                    Weak Question Types
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={dashboardView.showPapers} onChange={(e) => setDashboardView((prev) => ({ ...prev, showPapers: e.target.checked }))} />
                    Lowest Performing Papers
                  </label>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Display Method</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Weak Knowledge Points</label>
                    <select
                      value={dashboardView.weakSkillsView}
                      onChange={(e) => setDashboardView((prev) => ({ ...prev, weakSkillsView: e.target.value as 'chart' | 'table' }))}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full"
                    >
                      <option value="chart">Bar Chart</option>
                      <option value="table">Table</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Students Needing Attention</label>
                    <select
                      value={dashboardView.studentsView}
                      onChange={(e) => setDashboardView((prev) => ({ ...prev, studentsView: e.target.value as 'table' | 'cards' }))}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full"
                    >
                      <option value="table">Table</option>
                      <option value="cards">Cards</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Overview Cards */}
        {dashboardView.showOverview && (
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
        )}

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Subject Insights</h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-medium text-gray-600">Subject</label>
              <select
                aria-label="Subject"
                value={selectedSubject}
                onChange={(e) => {
                  setSelectedSubject(e.target.value);
                  setSelectedPaperId('all');
                }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="all">All Subjects</option>
                <option value="reading">Reading</option>
                <option value="listening">Listening</option>
                <option value="writing">Writing</option>
                <option value="speaking">Speaking</option>
              </select>
              <label className="text-sm font-medium text-gray-600">Paper</label>
              <select
                aria-label="Paper"
                value={selectedPaperId}
                onChange={(e) => setSelectedPaperId(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 min-w-[180px]"
              >
                <option value="all">All Papers</option>
                {paperOptions.map((paper) => (
                  <option key={paper.id} value={String(paper.id)}>
                    {paper.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedSubject === 'all' && selectedPaperId === 'all' && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">All Subjects Total (All Papers)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border border-gray-100 p-4">
                  <div className="text-xs text-gray-500 uppercase">Objective Total Accuracy</div>
                  <div className="text-2xl font-semibold text-indigo-600 mt-1">{objectiveCombinedAccuracy}%</div>
                </div>
                <div className="rounded-lg border border-gray-100 p-4">
                  <div className="text-xs text-gray-500 uppercase">Objective Correct / Total</div>
                  <div className="text-2xl font-semibold text-gray-800 mt-1">{objectiveCombined.correct} / {objectiveCombined.total}</div>
                </div>
                <div className="rounded-lg border border-gray-100 p-4">
                  <div className="text-xs text-gray-500 uppercase">Productive Avg Score</div>
                  <div className="text-2xl font-semibold text-indigo-600 mt-1">{subjectBreakdown.productive.overall_average_score}%</div>
                </div>
              </div>
            </div>
          )}

          {showObjectiveInsights && (
            <div className="space-y-4">
              {(selectedSubject === 'all'
                ? [
                    { key: 'reading', label: 'Reading', accuracy: subjectBreakdown.objective.reading_accuracy, rows: readingRows, color: 'text-blue-600' },
                    { key: 'listening', label: 'Listening', accuracy: subjectBreakdown.objective.listening_accuracy, rows: listeningRows, color: 'text-emerald-600' },
                  ]
                : [
                    {
                      key: selectedSubject,
                      label: selectedSubject === 'reading' ? 'Reading' : 'Listening',
                      accuracy: selectedSubject === 'reading' ? subjectBreakdown.objective.reading_accuracy : subjectBreakdown.objective.listening_accuracy,
                      rows: selectedSubject === 'reading' ? readingRows : listeningRows,
                      color: selectedSubject === 'reading' ? 'text-blue-600' : 'text-emerald-600',
                    },
                  ]).map((section) => (
                <div key={section.key} className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700">{section.label}</h3>
                  <div className="rounded-lg border border-gray-100 p-4">
                    <div className="text-xs text-gray-500 uppercase">{section.label} Accuracy</div>
                    <div className={`text-2xl font-semibold mt-1 ${section.color}`}>{section.accuracy}%</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Question Type</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Accuracy</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Correct / Total</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {section.rows.length > 0 ? (
                          section.rows.map((row) => (
                            <tr key={`${section.key}-${row.question_type}`}>
                              <td className="px-3 py-2 text-gray-700">{typeLabel(row.question_type)}</td>
                              <td className="px-3 py-2 text-gray-500">{row.accuracy}%</td>
                              <td className="px-3 py-2 text-gray-500">{row.correct} / {row.total}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="px-3 py-3 text-gray-400" colSpan={3}>No {section.label.toLowerCase()} data yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showObjectiveInsights && showProductiveInsights && (
            <div className="my-6 border-t border-gray-100"></div>
          )}

          {showProductiveInsights && (
            <div className="space-y-4">
              {(selectedSubject === 'all'
                ? [
                    { key: 'writing', label: 'Writing', average: writingRow?.average_score ?? 0 },
                    { key: 'speaking', label: 'Speaking', average: speakingRow?.average_score ?? 0 },
                  ]
                : [
                    {
                      key: selectedSubject,
                      label: selectedSubject === 'writing' ? 'Writing' : 'Speaking',
                      average: subjectBreakdown.productive.overall_average_score,
                    },
                  ]).map((section) => (
                <div key={section.key} className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700">{section.label}</h3>
                  <div className="rounded-lg border border-gray-100 p-4">
                    <div className="text-xs text-gray-500 uppercase">{section.label} Average Score</div>
                    <div className="text-2xl font-semibold text-indigo-600 mt-1">{section.average}%</div>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-gray-100 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Rubric Means</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-gray-600">Content</div><div className="text-right text-gray-800">{subjectBreakdown.productive.rubric.content}</div>
                    <div className="text-gray-600">Language</div><div className="text-right text-gray-800">{subjectBreakdown.productive.rubric.language}</div>
                    <div className="text-gray-600">Organization</div><div className="text-right text-gray-800">{subjectBreakdown.productive.rubric.organization}</div>
                    <div className="text-gray-600">Overall</div><div className="text-right text-gray-800">{subjectBreakdown.productive.rubric.overall}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-gray-100 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">By Paper Type</h3>
                  <div className="space-y-2 text-sm">
                    {subjectBreakdown.productive.by_paper_type.length > 0 ? (
                      subjectBreakdown.productive.by_paper_type.map((row) => (
                        <div key={row.paper_type} className="flex items-center justify-between">
                          <span className="capitalize text-gray-700">{row.paper_type}</span>
                          <span className="text-gray-500">{row.average_score}% ({row.submissions})</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-gray-400">No writing/speaking data yet.</div>
                    )}
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">LCA / SCA / Lexical Metrics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                  {subjectBreakdown.productive.metrics.length > 0 ? (
                    subjectBreakdown.productive.metrics.map((metric) => (
                      <div key={metric.key} className="flex items-center justify-between rounded-md border border-gray-100 px-2 py-1.5">
                        <span className="text-gray-600">{toFriendlyMetricLabel(metric.key)}</span>
                        <span className="text-gray-800">{metric.value}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-400">No metric data yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Weak Skills Chart */}
          {dashboardView.showWeakSkills && (
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
            {dashboardView.weakSkillsView === 'chart' ? (
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
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Skill</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sortedWeakSkills.length > 0 ? sortedWeakSkills.map((item) => (
                      <tr key={item.skill}>
                        <td className="px-3 py-2 text-gray-700">{item.skill}</td>
                        <td className="px-3 py-2 text-gray-500">{item.errors}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td className="px-3 py-3 text-gray-400" colSpan={2}>No error data available yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {weakAreas?.skills?.length ? (
              <div className="mt-4 text-xs text-gray-500">
                Accuracy is calculated from total answers per skill.
              </div>
            ) : null}
          </div>
          )}

          {/* At-Risk Students Table */}
          {dashboardView.showStudents && (
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
            {dashboardView.studentsView === 'table' ? (
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
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sortedStudents.length > 0 ? sortedStudents.map((student, idx) => (
                  <div key={`${student.student}-${idx}`} className="rounded-lg border border-gray-100 p-3">
                    <div className="text-sm font-semibold text-gray-800">{student.student}</div>
                    <div className="mt-1 text-xs text-gray-500">Avg: {student.average_score} · Exams: {student.exams_taken}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(sortedWeakAreaStudents?.[idx]?.weak_skills || []).length > 0 ? (
                        (sortedWeakAreaStudents?.[idx]?.weak_skills || []).map((skill) => (
                          <span key={skill.skill} className="px-2 py-1 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-100">
                            {skill.skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">No skill data</span>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="text-gray-400 text-sm">No student data available.</div>
                )}
              </div>
            )}
          </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          {dashboardView.showQuestionTypes && (
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
          )}

          {dashboardView.showPapers && (
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
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
