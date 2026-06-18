import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';

interface Activity {
  id: number;
  wbs: string;
  name: string;
  discipline: string;
  start: string;
  finish: string;
  duration: number;
  progress_pct: number;
  status: string;
  is_critical: boolean;
}

interface ActivityTimelineProps {
  activities: Activity[];
  isDetailedView?: boolean;
  onViewDetails?: () => void;
  onBack?: () => void;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  activities,
  isDetailedView = false,
  onViewDetails,
  onBack
}) => {
  const [activeTab, setActiveTab] = useState('All');

  const tabs = ['All', 'Civil', 'Architectural', 'Mechanical', 'Electrical', 'Commissioning'];

  const filteredActivities = React.useMemo(() => {
    return activities.filter(a => {
      if (activeTab === 'All') return true;
      if (activeTab === 'Architectural' && a.discipline === 'Arch') return true;
      if (activeTab === 'Commissioning' && a.discipline === 'All') return true;
      return a.discipline === activeTab.substring(0, 4) || a.discipline === activeTab;
    });
  }, [activities, activeTab]);

  const getBarColor = (pct: number, isCritical: boolean) => {
    if (pct === 100) return 'bg-[#639922]';
    if (isCritical && pct === 0) return 'bg-[#C53030]';
    if (pct > 0) return 'bg-[#2D5A8E]';
    return 'bg-[#A0AEC0]';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <div>
          {isDetailedView && onBack && (
            <button onClick={onBack} className="flex items-center gap-1 text-sm text-accent hover:underline mb-3">
              <ArrowLeft size={14} /> Back to overview
            </button>
          )}
          <h3 className={`font-heading ${isDetailedView ? 'text-2xl font-semibold' : 'text-sm font-semibold uppercase tracking-wide text-muted-foreground'}`}>
            Activity Timeline
          </h3>
        </div>
        {!isDetailedView && onViewDetails && (
          <button onClick={onViewDetails} className="text-xs text-accent hover:underline">Expand →</button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-0 mb-5 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap border-b-2 ${
              activeTab === tab
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Timeline Bars */}
      <div className="flex-1 overflow-y-auto pr-2" style={{ maxHeight: isDetailedView ? 'calc(100vh - 250px)' : '280px' }}>
        {filteredActivities.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm font-medium">No activities for {activeTab}.</div>
        ) : (
          <div className="space-y-3">
            {filteredActivities.map((activity, idx) => {
              const barColor = getBarColor(activity.progress_pct, activity.is_critical);
              return (
                <div key={activity.id || idx} className="flex items-center gap-4 text-sm py-1">
                  <div className="w-1/3 min-w-[200px] shrink-0 text-muted-foreground whitespace-normal leading-snug">
                    <span className="font-bold text-foreground mr-1.5">{activity.wbs}</span>
                    <span className="font-medium text-foreground/90">{activity.name}</span>
                  </div>
                  <div className="flex-1 h-2.5 bg-secondary rounded-sm relative overflow-hidden">
                    <div
                      className={`absolute top-0 left-0 h-full rounded-sm ${barColor}`}
                      style={{ width: `${Math.max(2, activity.progress_pct)}%` }}
                    />
                  </div>
                  <div className={`w-10 shrink-0 text-right font-bold ${
                    activity.progress_pct === 100 ? 'text-[#639922]' :
                    (activity.is_critical && activity.progress_pct === 0) ? 'text-[#C53030]' : 'text-foreground'
                  }`}>
                    {activity.progress_pct === 100 ? '✓' : `${activity.progress_pct}%`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-5 pt-4 border-t border-border">
        <div className="flex flex-wrap gap-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span className="w-3 h-3 rounded-sm bg-[#639922]"></span> Complete
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span className="w-3 h-3 rounded-sm bg-[#2D5A8E]"></span> In progress
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span className="w-3 h-3 rounded-sm bg-[#C53030]"></span> Critical / overdue
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span className="w-3 h-3 rounded-sm bg-[#A0AEC0]"></span> Not started
          </div>
        </div>
      </div>
    </div>
  );
};
