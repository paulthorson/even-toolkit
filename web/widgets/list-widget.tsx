import type { ReactNode } from 'react';
import { cn } from '../utils/cn';
import { Card } from '../components/card';
import { ListItem } from '../components/list-item';
import type { WidgetProps } from './index';

interface ListWidgetItem {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}

interface ListWidgetProps extends WidgetProps {
  items?: ListWidgetItem[];
  onItemPress?: (index: number) => void;
}

/**
 * A list widget: a card containing a compact stack of `ListItem` rows,
 * with the widget `title` as the card heading.
 */
function ListWidget({ title, items = [], onItemPress, className }: ListWidgetProps) {
  return (
    <Card padding="sm" className={cn('h-full', className)}>
      {title && (
        <div className="text-[15px] tracking-[-0.15px] text-text px-2 pt-1 pb-2">{title}</div>
      )}
      <div className="flex flex-col rounded-[6px] overflow-hidden">
        {items.map((item, i) => (
          <ListItem
            key={i}
            title={item.title}
            subtitle={item.subtitle}
            leading={item.leading}
            trailing={item.trailing}
            onPress={onItemPress ? () => onItemPress(i) : undefined}
          />
        ))}
      </div>
    </Card>
  );
}

export { ListWidget };
export type { ListWidgetProps, ListWidgetItem };
