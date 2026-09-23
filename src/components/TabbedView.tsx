import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

export interface TabDef {
  key: string;
  label: string;
  icon: IconName;
  content: ReactNode;
}

interface Props {
  tabs: TabDef[];
  defaultTab?: string;
}

// A small in-page tab strip used to fold several related "Tools" pages (e.g.
// Performance Mode + System Monitor + Streak Tracker) behind one sidebar
// entry instead of one nav item per page — see Sidebar.tsx for the grouping.
// Purely local state: which tab is open is not part of the app's view router,
// so switching tabs never touches history/URL and resets to defaultTab (or
// the first tab) whenever the hub is reopened from the sidebar.
//
// Keyboard: follows the WAI-ARIA tabs pattern — the strip is one Tab stop
// (roving tabIndex), Left/Right move between tabs (mirrored in RTL, so the
// arrow always moves in the direction it points on screen), Home/End jump to
// the first/last tab, and each tab is linked to its tabpanel for screen readers.
export default function TabbedView({ tabs, defaultTab }: Props) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.key);
  const current = tabs.find((tab) => tab.key === active) || tabs[0];
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusTab(index: number) {
    const count = tabs.length;
    if (count === 0) return;
    const next = (index + count) % count;
    setActive(tabs[next].key);
    tabRefs.current[next]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.key === current?.key);
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === forward) focusTab(index + 1);
    else if (e.key === backward) focusTab(index - 1);
    else if (e.key === 'Home') focusTab(0);
    else if (e.key === 'End') focusTab(tabs.length - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div className="tabbed-view">
      <div className="tab-strip" role="tablist" onKeyDown={onKeyDown}>
        {tabs.map((tab, i) => {
          const selected = tab.key === current?.key;
          return (
            <button
              key={tab.key}
              ref={(el) => { tabRefs.current[i] = el; }}
              id={`${baseId}-tab-${tab.key}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              className={`tab-strip-item ${selected ? 'active' : ''}`}
              onClick={() => setActive(tab.key)}
            >
              <Icon name={tab.icon} size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div
        className="tab-strip-content"
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={current ? `${baseId}-tab-${current.key}` : undefined}
      >
        {current?.content}
      </div>
    </div>
  );
}
