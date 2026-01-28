import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import { TrendingUp, AlertTriangle } from 'lucide-react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

interface ReportOverview {
    average_score: number;
    total_submissions: number;
    latest_score: number | null;
}

interface WeakSkill {
    skill: string;
    errors: number;
}

interface SkillAccuracy {
    skill: string;
    accuracy: number;
}

interface RecentSubmission {
    id: number;
    paper_title: string;
    score: number | null;
    submitted_at: string;
}

interface StudentReportResponse {
    overview: ReportOverview;
    trend?: Array<{
        paper_id: number;
        paper_title: string;
        score: number | null;
        submitted_at: string;
    }>;
    weak_skills: WeakSkill[];
    skill_accuracy: SkillAccuracy[];
    type_accuracy?: Array<{
        question_type: string;
        accuracy: number;
        total: number;
    }>;
    recent: RecentSubmission[];
    summary: string;
}

const QUESTION_TYPE_LABELS: Record<string, string> = {
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

const formatQuestionType = (value: string) => {
    const key = value?.toLowerCase?.() ?? '';
    return QUESTION_TYPE_LABELS[key] || value || 'Unknown';
};

export default function StudentReport() {
    const [loading, setLoading] = useState(true);
    const [report, setReport] = useState<StudentReportResponse | null>(null);

    useEffect(() => {
        const fetchReport = async () => {
            try {
                const res = await api.get('/analytics/student-report');
                setReport(res.data);
            } catch (error) {
                console.error('Failed to fetch report data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchReport();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="text-xl font-semibold">Loading Report...</div>
            </div>
        );
    }

    const trendData = (report?.trend || []).map(item => ({
        name: new Date(item.submitted_at).toLocaleDateString(),
        score: item.score ?? 0,
        title: item.paper_title,
    }));

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
                            {report?.summary || 'Complete a paper to see your personalized summary.'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                    <h3 className="font-semibold text-gray-800 mb-4">Overview</h3>
                    <div className="space-y-3 text-sm text-gray-600">
                        <div className="flex justify-between">
                            <span>Average Score</span>
                            <span className="font-semibold text-gray-900">{report?.overview?.average_score ?? 0}%</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Total Submissions</span>
                            <span className="font-semibold text-gray-900">{report?.overview?.total_submissions ?? 0}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Latest Score</span>
                            <span className="font-semibold text-gray-900">
                                {report?.overview?.latest_score ?? '—'}
                            </span>
                        </div>
                    </div>

                    <div className="mt-6">
                        <h4 className="font-semibold text-gray-800 mb-3">Skill Accuracy</h4>
                        <div className="space-y-4">
                            {(report?.skill_accuracy || []).length > 0 ? (
                                report?.skill_accuracy.map(item => (
                                    <div key={item.skill}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-gray-600">{item.skill}</span>
                                            <span className="font-medium text-gray-900">{item.accuracy}%</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${item.accuracy}%` }}></div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-sm text-gray-400">No skill data yet.</div>
                            )}
                        </div>
                    </div>

                    <div className="mt-6">
                        <h4 className="font-semibold text-gray-800 mb-3">Recent Trend</h4>
                        <div className="h-48">
                            {trendData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={trendData}
                                        margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" />
                                        <YAxis domain={[0, 100]} />
                                        <Tooltip formatter={(value: number, _, props: any) => [value, props?.payload?.title || 'Score']} />
                                        <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="text-sm text-gray-400">No trend data yet.</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                    <h3 className="font-semibold text-gray-800 mb-4">Weak Areas</h3>
                    <ul className="space-y-3">
                        {(report?.weak_skills || []).length > 0 ? (
                            report?.weak_skills.map(weak => (
                                <li key={weak.skill} className="flex items-center gap-3 text-gray-600 text-sm p-3 bg-red-50 rounded-lg border border-red-100">
                                    <AlertTriangle size={16} className="text-red-500" />
                                    {weak.skill} ({weak.errors})
                                </li>
                            ))
                        ) : (
                            <li className="text-sm text-gray-400">No weak areas identified yet.</li>
                        )}
                    </ul>

                    <div className="mt-6">
                        <h4 className="font-semibold text-gray-800 mb-3">Recent Submissions</h4>
                        <div className="space-y-2 text-sm">
                            {(report?.recent || []).length > 0 ? (
                                report?.recent.map(item => (
                                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                                        <div className="text-gray-600">{item.paper_title}</div>
                                        <div className="font-medium text-gray-900">{item.score ?? '—'}%</div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-sm text-gray-400">No submissions yet.</div>
                            )}
                        </div>
                    </div>

                    <div className="mt-6">
                        <h4 className="font-semibold text-gray-800 mb-3">Question Type Accuracy</h4>
                        <div className="space-y-3">
                            {(report?.type_accuracy || []).length > 0 ? (
                                report?.type_accuracy?.map(item => (
                                    <div key={item.question_type} className="text-sm">
                                        <div className="flex justify-between mb-1">
                                            <span className="text-gray-600">{formatQuestionType(item.question_type)}</span>
                                            <span className="font-medium text-gray-900">{item.accuracy}%</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div
                                                className="bg-emerald-500 h-2 rounded-full"
                                                style={{ width: `${item.accuracy}%` }}
                                            ></div>
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1">{item.total} questions</div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-sm text-gray-400">No question-type stats yet.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
