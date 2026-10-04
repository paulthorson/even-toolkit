import { cn } from '../utils/cn';
import { Widget } from '../widgets/index';

interface DashboardWidgetSlot {
  /** Registered widget name (e.g. 'stat', or a name registered via registerWidget). */
  name: string;
  title?: string;
  /**
   * Number of grid columns the widget spans (1-12). Below the `md`
   * breakpoint every widget spans all 12 columns (full width).
   * Defaults to 6. Clamped to 1-12.
   */
  span?: number;
  /** Widget-specific payload, spread over the standard widget props. */
  data?: Record<string, unknown>;
  className?: string;
}

interface DashboardLayoutProps {
  widgets: DashboardWidgetSlot[];
  className?: string;
}

const clampSpan = (span?: number) => Math.min(12, Math.max(1, Math.round(span ?? 6)));

const spanClasses: Record<number, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  5: 'md:col-span-5',
  6: 'md:col-span-6',
  7: 'md:col-span-7',
  8: 'md:col-span-8',
  9: 'md:col-span-9',
  10: 'md:col-span-10',
  11: 'md:col-span-11',
  12: 'md:col-span-12',
};

/**
 * A responsive 12-column widget grid that renders registered dashboard
 * widgets by name. Each slot's `span` sets how many grid columns the
 * widget occupies on `md` screens and up; on smaller screens every widget
 * goes full width.
 *
 * Usage:
 * ```tsx
 * import { DashboardLayout, registerAllWidgets } from 'even-toolkit/web';
 * await registerAllWidgets();
 * <DashboardLayout widgets={[
 *   { name: 'stat', title: 'Orders', span: 6, data: { value: 42, change: '+8%', trend: 'up' } },
 *   { name: 'chart', title: 'Revenue', span: 6, data: { kind: 'bar', data: chartData } },
 * ]} />
 * ```
 */
function DashboardLayout({ widgets, className }: DashboardLayoutProps) {
  return (
    <div className={cn('grid grid-cols-12 gap-3', className)}>
      {widgets.map((slot, i) => {
        const span = clampSpan(slot.span);
        return (
          <div key={i} className={cn('col-span-12', spanClasses[span])}>
            <Widget
              name={slot.name}
              title={slot.title}
              span={span}
              className={slot.className}
              data={slot.data}
            />
          </div>
        );
      })}
    </div>
  );
}

export { DashboardLayout };
export type { DashboardLayoutProps, DashboardWidgetSlot };
