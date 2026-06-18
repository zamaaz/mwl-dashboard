import React from 'react';

interface KpiData {
  value: number;
  display: string;
  severity: string;
  description: string;
}

interface KpiGridProps {
  kpis: Record<string, KpiData>;
}

export const KpiGrid: React.FC<KpiGridProps> = ({ kpis }) => {
  if (!kpis) return null;

  const getBorderColor = (severity: string) => {
    switch (severity) {
      case 'Critical':
      case 'danger':
        return 'border-l-[#C53030]';
      case 'High':
      case 'warn':
      case 'warning':
        return 'border-l-[#B7791F]';
      case 'Normal':
      case 'ok':
        return 'border-l-[#276749]';
      default:
        return 'border-l-border';
    }
  };

  const getValueColor = (severity: string) => {
    switch (severity) {
      case 'Critical':
      case 'danger':
        return 'text-[#C53030]';
      case 'High':
      case 'warn':
      case 'warning':
        return 'text-[#B7791F]';
      case 'Normal':
      case 'ok':
        return 'text-[#276749]';
      default:
        return 'text-foreground';
    }
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      {Object.entries(kpis).map(([key, kpi]) => (
        <div
          key={key}
          className={`border border-border bg-white rounded p-4 md:p-5 flex flex-col justify-between border-l-4 ${getBorderColor(kpi.severity)}`}
        >
          <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">{kpi.description}</span>
          <span className={`font-heading text-3xl md:text-4xl lg:text-5xl font-medium tracking-tighter ${getValueColor(kpi.severity)}`}>
            {kpi.display}
          </span>
        </div>
      ))}
    </div>
  );
};
