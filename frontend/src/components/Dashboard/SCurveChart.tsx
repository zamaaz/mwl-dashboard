import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface SCurveData {
  labels: string[];
  planned: number[];
  actual: (number | null)[];
}

interface SCurveChartProps {
  data: SCurveData;
  reportDate: string;
}

export const SCurveChart: React.FC<SCurveChartProps> = ({ data, reportDate }) => {
  if (!data || !data.labels) return <div className="text-muted-foreground text-sm">No S-Curve data available</div>;

  const chartData = data.labels.map((label, index) => ({
    name: label,
    planned: data.planned[index] !== undefined ? data.planned[index] : null,
    actual: data.actual[index] !== undefined ? data.actual[index] : null,
  }));

  return (
    <div className="h-full w-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            tickMargin={10}
            angle={-45}
            textAnchor="end"
            height={55}
          />
          <YAxis
            tickFormatter={(val) => `${val}%`}
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '4px',
              border: '1px solid #e5e7eb',
              boxShadow: 'none',
              backgroundColor: '#fff',
              fontSize: '13px',
            }}
            formatter={(value: any) => [`${value}%`, undefined]}
          />
          <Legend
            wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }}
            iconType="plainline"
          />
          <Line
            type="monotone"
            dataKey="planned"
            name="Planned"
            stroke="#2D5A8E"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke="#C4510A"
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: '#C4510A' }}
            activeDot={{ r: 5, strokeWidth: 0 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
