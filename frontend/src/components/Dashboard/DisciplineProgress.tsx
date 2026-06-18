import React from 'react';

interface DisciplineData {
  name: string;
  code: string;
  progress_pct: number;
  total: number;
  completed: number;
  in_progress: number;
  not_started: number;
  status_label: string;
}

interface DisciplineProgressProps {
  disciplines: DisciplineData[];
}

const getBarColor = (pct: number, statusLabel: string) => {
  if (pct >= 80) return 'bg-[#276749]';
  if (pct >= 40) return 'bg-[#B7791F]';
  if (pct > 0) return 'bg-[#C53030]';
  return 'bg-[#A0AEC0]';
};

export const DisciplineProgress: React.FC<DisciplineProgressProps> = ({ disciplines }) => {
  if (!disciplines || disciplines.length === 0) return <div className="text-muted-foreground text-sm">No discipline data</div>;

  return (
    <div className="space-y-5 mt-3">
      {disciplines.map((disc, idx) => (
        <div key={idx}>
          <div className="flex justify-between items-baseline mb-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-foreground">{disc.name}</span>
              <span className="text-xs text-muted-foreground">{disc.total} activities</span>
            </div>
            <span className="font-heading text-lg font-semibold text-foreground">{disc.progress_pct}%</span>
          </div>

          <div className="h-2 w-full bg-secondary rounded-sm overflow-hidden">
            <div
              className={`h-full rounded-sm ${getBarColor(disc.progress_pct, disc.status_label)}`}
              style={{ width: `${disc.progress_pct}%` }}
            />
          </div>

          <div className="flex justify-between mt-1">
            <p className="text-[11px] text-muted-foreground">
              {disc.completed} done · {disc.in_progress} active · {disc.not_started} pending
            </p>
            <p className={`text-[11px] font-medium ${
              disc.status_label === 'Leading' ? 'text-[#276749]' :
              disc.status_label === 'On Track' ? 'text-[#276749]' :
              disc.status_label === 'At risk' ? 'text-[#C53030]' :
              disc.status_label === 'Under-mobilized' ? 'text-[#C53030]' :
              'text-muted-foreground'
            }`}>
              {disc.status_label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
