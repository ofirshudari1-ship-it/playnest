import type { LibraryItem, Settings } from '../types';
import Icon, { type IconName } from './Icon';
import Logo from './Logo';
import { useTranslation } from '../i18n';

// The Tools section used to be 8 flat nav items (performance, streak,
// benchmark, analytics, recommendations, insights, storage, hardware) — one
// click each, but a long, undifferentiated list in the sidebar. They're now
// grouped into 3 "hub" views, each a TabbedView folding the same pages in as
// tabs, so every feature is still reachable, just under fewer top-level
// clicks. See App.tsx for what each hub renders.
export type ViewKey =
  | 'all' | 'games' | 'applications' | 'favorites' | 'system' | 'hidden'
  | 'performance-hub' | 'insights-hub' | 'system-hub' | 'settings'
  | `collection:${string}`;

interface Props {
  active: ViewKey;
  onSelect: (view: ViewKey) => void;
  library: LibraryItem[];
  settings: Settings;
  onNewCollection: () => void;
}

export default function Sidebar({ active, onSelect, library, settings, onNewCollection }: Props) {
  const t = useTranslation();
  const counts = {
    all: library.length,
    games: library.filter((i) => i.category === 'game').length,
    applications: library.filter((i) => i.category === 'application').length,
    favorites: library.filter((i) => i.isFavorite).length,
    system: library.filter((i) => i.category === 'system').length,
    hidden: settings.hiddenItemIds.length
  };
  const collectionNames = Object.keys(settings.collections || {}).sort((a, b) => a.localeCompare(b));

  const item = (key: ViewKey, icon: IconName, label: string, count?: number | string) => (
    <button
      key={key}
      className={`nav-item ${active === key ? 'active' : ''}`}
      onClick={() => onSelect(key)}
      // The active view was conveyed by background/accent color only —
      // screen readers now get it explicitly too (STANDARDS.md §18.2).
      aria-current={active === key ? 'page' : undefined}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {count != null && <span className="count">{count}</span>}
    </button>
  );

  return (
    <nav className="sidebar" aria-label="Playnest">
      <div className="brand">
        <Logo size={34} />
        <div className="brand-name">Playnest</div>
      </div>

      <div className="nav-section-label">{t('sidebar.library')}</div>
      {item('all', 'everything', t('sidebar.everything'), counts.all)}
      {item('games', 'games', t('sidebar.games'), counts.games)}
      {item('applications', 'applications', t('sidebar.applications'), counts.applications)}
      {item('favorites', 'favorites', t('sidebar.favorites'), counts.favorites)}
      {item('system', 'system', t('sidebar.system'), counts.system)}
      {counts.hidden > 0 && item('hidden', 'hidden', t('sidebar.hidden'), counts.hidden)}

      <div className="nav-section-label">{t('sidebar.collections')}</div>
      {collectionNames.map((name) => item(`collection:${name}`, 'tag', name, settings.collections[name]?.length))}
      <button className="nav-item" onClick={onNewCollection} style={{ color: 'var(--text-faint)' }}>
        <Icon name="plus" />
        <span>{t('sidebar.newCollection')}</span>
      </button>

      <div className="nav-section-label">{t('sidebar.tools')}</div>
      {item('performance-hub', 'performance', t('sidebar.performanceHub'))}
      {item('insights-hub', 'insights', t('sidebar.insightsHub'))}
      {item('system-hub', 'storage', t('sidebar.systemHub'))}

      <div className="nav-divider" />
      {item('settings', 'settings', t('sidebar.settings'))}

      <div className="sidebar-footer">
        <div className="nav-item" style={{ cursor: 'default' }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('sidebar.footer')}</span>
        </div>
      </div>
    </nav>
  );
}
