import { cn } from '../utils/cn';
import { Card } from '../components/card';
import { Timeline } from '../components/timeline';
import type { TimelineEvent } from '../components/timeline';
import type { WidgetProps } from './index';

interface TimelineWidgetProps extends WidgetProps {
  events?: TimelineEvent[];
}

/**
 * An activity widget: a card wrapping a `Timeline` of events, with the
 * widget `title` as the card heading.
 */
function TimelineWidget({ title, events = [], className }: TimelineWidgetProps) {
  return (
    <Card className={cn('h-full', className)}>
      {title && (
        <div className="text-[15px] tracking-[-0.15px] text-text mb-3">{title}</div>
      )}
      <Timeline events={events} />
    </Card>
  );
}

export { TimelineWidget };
export type { TimelineWidgetProps };
