import { cn } from '../utils/cn';
import { Card } from '../components/card';
import { BarChart, PieChart } from '../components/chart';
import type { BarChartItem, PieChartItem } from '../components/chart';
import type { WidgetProps } from './index';

interface ChartWidgetProps extends WidgetProps {
  kind?: 'bar' | 'pie';
  data?: Array<BarChartItem | PieChartItem>;
  height?: number;
}

/**
 * A chart widget rendering either a bar chart or a donut chart inside a
 * card, with the widget `title` as the card heading. Composed from
 * `Card`, `BarChart`, and `PieChart`.
 */
function ChartWidget({
  title,
  kind = 'bar',
  data = [],
  height = 180,
  className,
}: ChartWidgetProps) {
  return (
    <Card className={cn('h-full', className)}>
      {title && (
        <div className="text-[15px] tracking-[-0.15px] text-text mb-3">{title}</div>
      )}
      {kind === 'pie' ? (
        <PieChart data={data as PieChartItem[]} donut size={Math.min(160, height)} />
      ) : (
        <BarChart data={data as BarChartItem[]} height={height} />
      )}
    </Card>
  );
}

export { ChartWidget };
export type { ChartWidgetProps };
