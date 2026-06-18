import React from 'react';

interface CriticalActivity {
  wbs: string;
  name: string;
  discipline: string;
  finish: string;
  progress_pct: number;
  days_left: number;
  risk: string;
}

interface CriticalPathProps {
  activities: CriticalActivity[];
  isDetailedView?: boolean;
  onViewDetails?: () => void;
}

export const CriticalPath: React.FC<CriticalPathProps> = ({ activities, isDetailedView = false, onViewDetails }) => {
  if (!activities || activities.length === 0) return <div className="text-muted-foreground text-sm">No critical activities</div>;

  const getBorderColor = (risk: string) => {
    switch (risk) {
      case 'Critical': return 'border-l-[#C53030]';
      case 'High': return 'border-l-[#B7791F]';
      default: return 'border-l-[#2D5A8E]';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Critical': return 'text-[#C53030]';
      case 'High': return 'text-[#B7791F]';
      default: return 'text-[#2D5A8E]';
    }
  };

  const displayedActivities = isDetailedView ? activities : activities.slice(0, 7);

  return (
    <div className="space-y-2 mt-3">
      {displayedActivities.map((act, idx) => (
        <div key={idx} className={`border border-border rounded px-4 py-3 border-l-4 bg-white ${getBorderColor(act.risk)}`}>
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate" title={act.name}>
                <span className="text-muted-foreground mr-1.5">{act.wbs}</span>
                {act.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {act.discipline} · Finish: {act.finish} · {act.progress_pct}% complete
              </p>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              <span className="text-xs text-muted-foreground">
                {act.days_left > 0 ? `${act.days_left}d left` : 'Overdue'}
              </span>
              <span className={`text-xs font-semibold ${getRiskColor(act.risk)}`}>
                {act.risk}
              </span>
            </div>
          </div>
        </div>
      ))}
      {!isDetailedView && activities.length > 7 && (
        <button onClick={onViewDetails} className="w-full py-2 text-xs text-accent hover:underline">
          View all {activities.length} critical activities →
        </button>
      )}
    </div>
  );
};
