import { StatWidget } from './stat-widget';
import { ChartWidget } from './chart-widget';
import { ListWidget } from './list-widget';
import { TimelineWidget } from './timeline-widget';
import type { WidgetComponent } from './index';

/** All built-in dashboard widgets, keyed by registration name. */
const allWidgets: Record<string, WidgetComponent> = {
  stat: StatWidget,
  chart: ChartWidget,
  list: ListWidget,
  timeline: TimelineWidget,
};

export { allWidgets };
