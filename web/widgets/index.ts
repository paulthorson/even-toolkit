import * as React from 'react';

/**
 * Standard props every dashboard widget receives. `span` is read by the
 * dashboard layout (number of grid columns, 1-12); the widget itself can
 * ignore it.
 */
interface WidgetProps {
  title?: string;
  span?: number;
  className?: string;
}

type WidgetComponent = React.FC<WidgetProps>;

const registry = new Map<string, WidgetComponent>();

/** Register a dashboard widget component under a name. */
export function registerWidget(name: string, component: WidgetComponent) {
  registry.set(name, component);
}

/** Register multiple widgets at once. */
export function registerWidgets(widgets: Record<string, WidgetComponent>) {
  for (const [name, component] of Object.entries(widgets)) {
    registry.set(name, component);
  }
}

/** Register all built-in widgets ('stat', 'chart', 'list', 'timeline'). */
export async function registerAllWidgets() {
  const { allWidgets } = await import('./built-in-widgets');
  registerWidgets(allWidgets);
}

/** Get a registered widget component by name, or undefined. */
export function getWidget(name: string): WidgetComponent | undefined {
  return registry.get(name);
}

/** Get all registered widget names. */
export function getWidgetNames(): string[] {
  return Array.from(registry.keys());
}

interface WidgetRendererProps extends WidgetProps {
  name: string;
  /** Widget-specific payload, spread over the standard widget props. */
  data?: Record<string, unknown>;
}

/**
 * Renders a registered widget by name, spreading `data` over the standard
 * widget props.
 *
 * Usage:
 * ```tsx
 * import { Widget, registerWidget, StatWidget } from 'even-toolkit/web';
 * registerWidget('my-stat', StatWidget);
 * <Widget name="my-stat" title="Orders" span={6} data={{ value: 42 }} />
 * ```
 */
function Widget({ name, data, ...rest }: WidgetRendererProps) {
  const WidgetComp = registry.get(name);
  if (!WidgetComp) {
    console.warn(`[even-toolkit] Widget "${name}" not found in registry.`);
    return null;
  }
  return React.createElement(WidgetComp, { ...rest, ...data });
}

export { Widget };
export type { WidgetProps, WidgetComponent, WidgetRendererProps };
