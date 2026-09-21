import { useState, type ReactNode } from 'react';
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
export default function TabbedView({ tabs, defaultTab }: Props) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.key);
  const current = tabs.find((tab) => tab.key === active) || tabs[0];

  return (
    <div className="tabbed-view">
      <div className="tab-strip" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={tab.key === active}
            className={`tab-strip-item ${tab.key === active ? 'active' : ''}`}
            onClick={() => setActive(tab.key)}
          >
            <Icon name={tab.icon} size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="tab-strip-content">{current?.content}</div>
    </div>
  );
}
