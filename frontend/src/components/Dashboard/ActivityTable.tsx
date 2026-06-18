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

interface ActivityTableProps {
  activities: Activity[];
  isDetailedView?: boolean;
  onViewDetails?: () => void;
  onBack?: () => void;
}

export const ActivityTable: React.FC<ActivityTableProps> = ({
  activities,
  isDetailedView = false,
  onViewDetails,
  onBack
}) => {
  const [sortField, setSortField] = useState<keyof Activity>('wbs');
  const [sortAsc, setSortAsc] = useState(true);

  const getStatusDot = (pct: number, start: string) => {
    if (pct === 100) return 'bg-[#639922]';
    if (pct === 0 && start && new Date(start) <= new Date('2026-06-09')) return 'bg-[#C53030]';
    if (pct > 0) return 'bg-[#B7791F]';
    return 'bg-[#A0AEC0]';
  };

  const getBarColor = (pct: number, start: string) => {
    if (pct === 100) return 'bg-[#639922]';
    if (pct === 0 && start && new Date(start) <= new Date('2026-06-09')) return 'bg-[#C53030]';
    if (pct > 0) return 'bg-[#2D5A8E]';
    return 'bg-[#A0AEC0]';
  };

  const getStatusText = (pct: number, start: string) => {
    if (pct === 100) return { color: 'text-[#276749]', label: 'Complete' };
    if (pct === 0 && start && new Date(start) <= new Date('2026-06-09')) return { color: 'text-[#C53030]', label: 'Critical' };
    if (pct > 0) return { color: 'text-[#2D5A8E]', label: 'In Progress' };
    return { color: 'text-[#B7791F]', label: 'Not Started' };
  };

  const formatShortDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'Ongoing') return dateStr || '—';
    try {
      const dt = new Date(dateStr);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${dt.getDate()} ${months[dt.getMonth()]}`;
    } catch {
      return dateStr;
    }
  };

  const sortedActivities = React.useMemo(() => {
    return [...activities].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [activities, sortField, sortAsc]);

  const handleSort = (field: keyof Activity) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
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
            Activity Register
          </h3>
        </div>
        {!isDetailedView && onViewDetails && (
          <button onClick={onViewDetails} className="text-xs text-accent hover:underline">View all →</button>
        )}
      </div>

      <div className="overflow-x-auto border border-border rounded">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-secondary/50 border-b border-border">
            <tr>
              <th className="px-4 py-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort('wbs')}>
                WBS {sortField === 'wbs' && (sortAsc ? '↑' : '↓')}
              </th>
              <th className="px-4 py-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => handleSort('name')}>
                Activity {sortField === 'name' && (sortAsc ? '↑' : '↓')}
              </th>
              <th className="px-4 py-3 font-semibold text-muted-foreground">Disc.</th>
              <th className="px-4 py-3 font-semibold text-muted-foreground">Start</th>
              <th className="px-4 py-3 font-semibold text-muted-foreground">Finish</th>
              <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Dur.</th>
              <th className="px-4 py-3 font-semibold text-muted-foreground min-w-[100px]">Progress</th>
              <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
              <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Crit.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {(isDetailedView ? sortedActivities : sortedActivities.slice(0, 10)).map((activity) => {
              const dotClass = getStatusDot(activity.progress_pct, activity.start);
              const barClass = getBarColor(activity.progress_pct, activity.start);
              const statusInfo = getStatusText(activity.progress_pct, activity.start);

              return (
                <tr key={activity.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3 font-semibold text-foreground">{activity.wbs}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2 min-w-[250px] whitespace-normal">
                      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${dotClass}`}></span>
                      <span className="font-medium text-foreground leading-snug">{activity.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-muted-foreground">{activity.discipline}</td>
                  <td className="px-4 py-3 font-medium text-muted-foreground">{formatShortDate(activity.start)}</td>
                  <td className="px-4 py-3 font-medium text-muted-foreground">{formatShortDate(activity.finish)}</td>
                  <td className="px-4 py-3 font-medium text-muted-foreground text-center">{activity.duration || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-2 bg-secondary rounded-sm overflow-hidden flex-shrink-0">
                        <div className={`h-full rounded-sm ${barClass}`} style={{ width: `${activity.progress_pct}%` }}></div>
                      </div>
                      <span className="font-semibold w-8 text-foreground">{activity.progress_pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] uppercase tracking-wide font-bold ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {activity.is_critical ?
                      <span className="text-[#C53030] font-bold text-lg leading-none">●</span> :
                      <span className="text-[#A0AEC0] font-bold text-lg leading-none">○</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!isDetailedView && sortedActivities.length > 10 && (
          <div className="py-3 px-4 text-center border-t border-border">
            <button onClick={onViewDetails} className="text-sm font-medium text-accent hover:underline">
              View all {activities.length} activities →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
