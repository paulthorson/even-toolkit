import { cn } from '../utils/cn';
import { StatCard } from '../components/chart';
import type { WidgetProps } from './index';

interface StatWidgetProps extends WidgetProps {
  label?: string;
  value?: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  sparklineData?: number[];
}

/**
 * A KPI widget: a single stat with an optional change indicator and
 * sparkline. Composed from `StatCard`.
 */
function StatWidget({
  title,
  label,
  value = '--',
  change,
  trend,
  sparklineData,
  className,
}: StatWidgetProps) {
  return (
    <StatCard
      label={label ?? title ?? ''}
      value={value}
      change={change}
      trend={trend}
      sparklineData={sparklineData}
      className={cn('h-full', className)}
    />
  );
}

export { StatWidget };
export type { StatWidgetProps };
