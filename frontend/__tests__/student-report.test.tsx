import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import StudentReport from '../pages/student/report';
import api from '../utils/api';

jest.mock('../utils/api');
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: ({ children, data }: any) => (
    <div>
      {children}
      {(data || []).map((item: any) => (
        <span key={item.name}>{item.name}</span>
      ))}
    </div>
  ),
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: ({ formatter }: any) => {
    if (formatter) {
      formatter(70, null, { payload: { title: 'Paper A' } });
      formatter(70, null, { payload: {} });
    }
    return <div>Tooltip</div>;
  }
}));

const mockedApi = api as jest.Mocked<typeof api>;

describe('StudentReport', () => {
  it('renders summary and type accuracy from API', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: {
        overview: { average_score: 75.5, total_submissions: 2, latest_score: 80 },
        trend: [
          { paper_id: 1, paper_title: '', score: null, submitted_at: new Date().toISOString() },
        ],
        weak_skills: [{ skill: 'Inference', errors: 3 }],
        skill_accuracy: [{ skill: 'Inference', accuracy: 70 }],
        type_accuracy: [{ question_type: 'MCQ', accuracy: 80, total: 10 }],
        recent: [{ id: 1, paper_title: 'Paper A', score: 70, submitted_at: new Date().toISOString() }],
        summary: 'Solid progress with room to refine key skills.'
      }
    });

    render(<StudentReport />);

    await waitFor(() => {
      expect(screen.getByText('Learning Report')).toBeInTheDocument();
      expect(screen.getByText(/Solid progress/)).toBeInTheDocument();
      expect(screen.getByText('Multiple Choice')).toBeInTheDocument();
      expect(screen.getByText('80%')).toBeInTheDocument();
    });
    expect(screen.getByText('Tooltip')).toBeInTheDocument();
  });

  it('logs fetch error and shows fallbacks', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedApi.get.mockRejectedValueOnce(new Error('fail'));

    render(<StudentReport />);

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(screen.getByText(/Learning Report/i)).toBeInTheDocument();
    expect(screen.getByText(/No skill data yet/i)).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it('renders unknown question type and recent fallback score', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: {
        overview: { average_score: 60, total_submissions: 1, latest_score: null },
        trend: [],
        weak_skills: [],
        skill_accuracy: [],
        type_accuracy: [{ question_type: undefined as any, accuracy: 50, total: 2 }],
        recent: [{ id: 1, paper_title: 'Paper A', score: null, submitted_at: new Date().toISOString() }],
        summary: ''
      }
    });

    render(<StudentReport />);

    await waitFor(() => expect(screen.getByText(/Learning Report/i)).toBeInTheDocument());
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('—%')).toBeInTheDocument();
  });

  it('renders trend chart when data exists', async () => {
    const dateSpy = jest.spyOn(Date.prototype, 'toLocaleDateString');
    const submittedAt = new Date().toISOString();
    const dateLabel = new Date(submittedAt).toLocaleDateString();
    mockedApi.get.mockResolvedValueOnce({
      data: {
        overview: { average_score: 90, total_submissions: 1, latest_score: 90 },
        trend: [
          { paper_id: 1, paper_title: 'Paper A', score: 90, submitted_at: submittedAt }
        ],
        weak_skills: [],
        skill_accuracy: [],
        type_accuracy: [],
        recent: [],
        summary: ''
      }
    });

    render(<StudentReport />);

    await waitFor(() => expect(screen.getByText(/Learning Report/i)).toBeInTheDocument());
    expect(screen.queryByText('No trend data yet.')).not.toBeInTheDocument();
    expect(screen.getByText(dateLabel)).toBeInTheDocument();
    expect(dateSpy).toHaveBeenCalled();
    dateSpy.mockRestore();
  });
});
