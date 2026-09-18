import { useEffect, useMemo, useState, useRef } from 'react';
import Fuse from 'fuse.js';
import SetupWizard from './components/Wizard/SetupWizard';
import Sidebar, { ViewKey } from './components/Sidebar';
import CategoryRow from './components/Library/CategoryRow';
import DetailModal from './components/Library/DetailModal';
import SettingsPanel from './components/Settings/SettingsPanel';
import HardwarePanel from './components/HardwarePanel';
import StorageView from './components/StorageView';
import AnalyticsView from './components/AnalyticsView';
import RecommendationsView from './components/RecommendationsView';
import InsightsView from './components/InsightsView';
import FilterMenu from './components/FilterMenu';
import ConfirmDialog from './components/ConfirmDialog';
import HelpOverlay from './components/HelpOverlay';
import SearchBar from './components/SearchBar';
import Icon, { type IconName } from './components/Icon';
import Logo from './components/Logo';
import StreakTracker from './components/StreakTracker';
import PerformanceMode from './components/PerformanceMode';
import SystemMonitor from './components/SystemMonitor';
import type { HardwareProfile, LibraryItem, Settings } from './types';
import { groupItems, sortItems, computeNeedsAttention } from './helpers';
import { showToast } from './toast';
import { useTranslation, setLanguage } from './i18n';

function emptyStateFor(view: ViewKey): { icon: IconName; titleKey: string; hintKey: string } {
  if (view.startsWith('collection:')) {
    return { icon: 'tag', titleKey: 'emptyState.collectionTitle', hintKey: 'emptyState.collectionHint' };
  }
  switch (view) {
    case 'games': return { icon: 'games', titleKey: 'emptyState.gamesTitle', hintKey: 'emptyState.gamesHint' };
    case 'applications': return { icon: 'applications', titleKey: 'emptyState.applicationsTitle', hintKey: 'emptyState.applicationsHint' };
    case 'favorites': return { icon: 'favorites', titleKey: 'emptyState.favoritesTitle', hintKey: 'emptyState.favoritesHint' };
    case 'system': return { icon: 'system', titleKey: 'emptyState.systemTitle', hintKey: 'emptyState.systemHint' };
    case 'hidden': return { icon: 'hidden', titleKey: 'emptyState.hiddenTitle', hintKey: 'emptyState.hiddenHint' };
    case 'analytics': return { icon: 'analytics', titleKey: 'emptyState.analyticsTitle', hintKey: 'emptyState.analyticsHint' };
    case 'recommendations': return { icon: 'recommend', titleKey: 'emptyState.recommendationsTitle', hintKey: 'emptyState.recommendationsHint' };
    case 'insights': return { icon: 'insights', titleKey: 'emptyState.insightsTitle', hintKey: 'emptyState.insightsHint' };
    default: return { icon: 'everything', titleKey: 'emptyState.defaultTitle', hintKey: 'emptyState.defaultHint' };
  }
}

const DEFAULT_SETTINGS: Settings = {
  steamGridApiKey: '',
  theme: 'system',
  language: 'en',
  hiddenCategories: ['system'],
  sortBy: 'name',
  groupBy: 'none',
  favorites: [],
  hiddenItemIds: [],
  collections: {},
  minimizeToTray: false,
  tags: {},
  setupWizardSeen: false,
  gridDensity: 'comfortable',
  quickLaunchHotkeyEnabled: true,
  autoRescanHours: 0
};

// Splash stays up at least this long so a fast startup never flickers by —
// but never artificially longer than the real load takes beyond that floor.
const MIN_SPLASH_MS = 900;

function applyTheme(theme: Settings['theme']) {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [view, setView] = useState<ViewKey>('all');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [fatalError, setFatalError] = useState(false);
  const [confirmUninstallId, setConfirmUninstallId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkUninstall, setConfirmBulkUninstall] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ hasUpdate: boolean; latestVersion?: string; downloadUrl?: string } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const t = useTranslation();

  async function loadLibrary() {
    const lib = await window.playnest.getLibrary();
    setLibrary(lib);
  }

  useEffect(() => {
    const startedAt = Date.now();
    (async () => {
      try {
        const [, loadedSettings] = await Promise.all([
          loadLibrary(),
          window.playnest.getSettings().then((s) => { setSettings(s); return s; })
        ]);
        window.playnest.getHardwareProfile().then(setHardware);
        applyTheme(loadedSettings.theme);
        setLanguage(loadedSettings.language);
      } catch (err) {
        console.error('Playnest startup error:', err);
        setFatalError(true);
      } finally {
        const elapsed = Date.now() - startedAt;
        setTimeout(() => setLoading(false), Math.max(0, MIN_SPLASH_MS - elapsed));
      }
    })();
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [settings.theme]);

  useEffect(() => {
    setLanguage(settings.language);
  }, [settings.language]);

  // Cover art now arrives in the background after a scan (see main.cjs) instead of
  // blocking the initial load — refresh quietly whenever a fresh batch lands.
  useEffect(() => window.playnest.onLibraryUpdated(loadLibrary), []);

  // Global quick-launch hotkey (main.cjs) already brought the window to the
  // front — just move focus to search so the user can start typing immediately.
  useEffect(() => window.playnest.onQuickLaunchTrigger(() => searchInputRef.current?.focus()), []);

  // A quiet, dismissible banner — never a popup, never blocks anything. Checked
  // once per launch; a dismissed version stays dismissed until a newer one ships.
  useEffect(() => {
    window.playnest.checkForUpdates().then(setUpdateInfo);
  }, []);

  // Local, offline "needs attention" check — runs the same cheap fs.existsSync pass
  // Settings' "Verify Library" button already does, but proactively once per app
  // launch instead of only when the user remembers to click it manually. Combined
  // with unplayed favorites (computeNeedsAttention, see helpers.ts) into a single
  // toast so a broken shortcut or a forgotten favorite doesn't go unnoticed for
  // weeks. No network call, no cloud AI — same local heuristic either way.
  useEffect(() => {
    if (loading || library.length === 0) return;
    window.playnest.verifyLibrary().then((stale) => {
      const needsAttention = computeNeedsAttention(library, new Set(stale.map((s) => s.id)));
      if (needsAttention.length === 0) return;
      const brokenCount = needsAttention.filter((n) => n.reason === 'broken').length;
      const unplayedFavCount = needsAttention.length - brokenCount;
      const parts: string[] = [];
      if (brokenCount > 0) parts.push(`${brokenCount} broken shortcut${brokenCount === 1 ? '' : 's'}`);
      if (unplayedFavCount > 0) parts.push(`${unplayedFavCount} unplayed favorite${unplayedFavCount === 1 ? '' : 's'}`);
      showToast(`Needs attention: ${parts.join(', ')}. Check Settings → Library Health.`, 'info');
    });
    // Intentionally runs once per fresh library load (e.g. after a scan), not on
    // every render — re-checking on every keystroke/sort would be wasted fs work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, library.length]);

  async function updateSettings(patch: Partial<Settings>) {
    const updated = await window.playnest.setSettings(patch);
    setSettings(updated);
  }

  // Onboarding only forces itself open once, on a genuinely first run — not every
  // time the library happens to be empty (that would trap a user who deliberately
  // skipped setup, or uninstalled everything they scanned). Returning users reach
  // the wizard again only via Settings → "Run Setup Wizard Again".
  useEffect(() => {
    if (!loading && !settings.setupWizardSeen) setShowWizard(true);
  }, [loading, settings.setupWizardSeen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl/Cmd + K: Focus search
      if (modKey && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Ctrl/Cmd + N: New collection
      else if (modKey && e.key === 'n') {
        e.preventDefault();
        createCollection();
      }
      // Ctrl/Cmd + T: Toggle theme
      else if (modKey && e.key === 't') {
        e.preventDefault();
        updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
      }
      // Ctrl/Cmd + /: Show help
      else if (modKey && e.key === '/') {
        e.preventDefault();
        setShowHelp(!showHelp);
      }
      // Escape: Close modals/dialogs
      else if (e.key === 'Escape') {
        if (showHelp) setShowHelp(false);
        else if (confirmUninstallId) setConfirmUninstallId(null);
        else if (confirmBulkUninstall) setConfirmBulkUninstall(false);
        else if (selectedItem) setSelectedItem(null);
        else if (selectMode) { setSelectMode(false); setSelectedIds(new Set()); }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedItem, confirmUninstallId, confirmBulkUninstall, selectMode, settings.theme, showHelp]);

  const fuse = useMemo(
    () => new Fuse(library, { keys: ['name', 'publisher', 'genre'], threshold: 0.35 }),
    [library]
  );

  const searched = search.trim() ? fuse.search(search).map((r) => r.item) : library;
  const nonHidden = searched.filter((i) => !settings.hiddenItemIds.includes(i.id));

  const visible = useMemo(() => {
    let result: LibraryItem[];
    if (view.startsWith('collection:')) {
      const name = view.slice('collection:'.length);
      const memberIds = new Set(settings.collections[name] || []);
      result = nonHidden.filter((i) => memberIds.has(i.id));
    } else {
      switch (view) {
        case 'games': result = nonHidden.filter((i) => i.category === 'game'); break;
        case 'applications': result = nonHidden.filter((i) => i.category === 'application'); break;
        case 'favorites': result = nonHidden.filter((i) => i.isFavorite); break;
        case 'system': result = nonHidden.filter((i) => i.category === 'system'); break;
        case 'hidden': result = searched.filter((i) => settings.hiddenItemIds.includes(i.id)); break;
        default: result = nonHidden.filter((i) => !settings.hiddenCategories.includes(i.category));
      }
    }
    return sortItems(result, settings.sortBy);
  }, [nonHidden, searched, view, settings.hiddenCategories, settings.hiddenItemIds, settings.collections, settings.sortBy]);

  function openItem(item: LibraryItem) {
    if (selectMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    } else {
      setSelectedItem(item);
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function bulkFavorite(makeFavorite: boolean) {
    for (const id of selectedIds) {
      const item = library.find((i) => i.id === id);
      if (item && item.isFavorite !== makeFavorite) await window.playnest.toggleFavorite(id);
    }
    await loadLibrary();
    showToast(`Updated favorites for ${selectedIds.size} item(s).`, 'success');
    exitSelectMode();
  }

  async function bulkHide(hide: boolean) {
    const hiddenSet = new Set(settings.hiddenItemIds);
    for (const id of selectedIds) {
      if (hide) hiddenSet.add(id);
      else hiddenSet.delete(id);
    }
    await updateSettings({ hiddenItemIds: [...hiddenSet] });
    showToast(hide ? `Hid ${selectedIds.size} item(s).` : `Unhid ${selectedIds.size} item(s).`, 'success');
    exitSelectMode();
  }

  async function bulkUninstall() {
    setConfirmBulkUninstall(false);
    let started = 0;
    for (const id of selectedIds) {
      const result = await window.playnest.uninstallItem(id);
      if (result.ok) started++;
    }
    showToast(`Started ${started} of ${selectedIds.size} uninstaller(s).`, started > 0 ? 'success' : 'error');
    exitSelectMode();
    setTimeout(loadLibrary, 1500);
  }

  async function createCollection() {
    const name = window.prompt('Name your new collection (e.g. "Couch Co-op", "Backlog"):');
    const trimmed = name?.trim();
    if (!trimmed) return;
    if (settings.collections[trimmed]) {
      showToast('A collection with that name already exists.', 'error');
      return;
    }
    await updateSettings({ collections: { ...settings.collections, [trimmed]: [] } });
    setView(`collection:${trimmed}`);
    showToast(`Created "${trimmed}".`, 'success');
  }

  async function handleAction(action: 'launch' | 'openFolder', id: string) {
    const result = action === 'launch' ? await window.playnest.launchItem(id) : await window.playnest.openFolder(id);
    if (!result.ok) showToast(result.error || 'Something went wrong.', 'error');
  }

  async function confirmUninstall() {
    const id = confirmUninstallId;
    setConfirmUninstallId(null);
    if (!id) return;
    const item = library.find((i) => i.id === id);
    const result = await window.playnest.uninstallItem(id);
    if (result.ok) {
      showToast(`Uninstalling ${item?.name || 'item'}...`, 'info');
      setSelectedItem(null);
      setTimeout(loadLibrary, 1500);
    } else {
      showToast(result.error || 'Could not start the uninstaller.', 'error');
    }
  }

  async function handleToggleFavorite(id: string) {
    const item = library.find((i) => i.id === id);
    await window.playnest.toggleFavorite(id);
    await loadLibrary();
    setSelectedItem((prev) => (prev && prev.id === id ? { ...prev, isFavorite: !prev.isFavorite } : prev));
    if (item) showToast(item.isFavorite ? `Removed ${item.name} from favorites.` : `Added ${item.name} to favorites.`, 'success');
  }

  async function handleToggleHidden(id: string) {
    const item = library.find((i) => i.id === id);
    await window.playnest.toggleHiddenItem(id);
    await loadLibrary();
    const nowHidden = !settings.hiddenItemIds.includes(id);
    setSettings((prev) => ({
      ...prev,
      hiddenItemIds: nowHidden ? [...prev.hiddenItemIds, id] : prev.hiddenItemIds.filter((h) => h !== id)
    }));
    if (nowHidden) setSelectedItem(null);
    if (item) showToast(nowHidden ? `Hid ${item.name}.` : `Unhid ${item.name}.`, 'success');
  }

  async function handleToggleCollection(collectionName: string, itemId: string) {
    const updatedCollections = await window.playnest.toggleCollectionItem(collectionName, itemId);
    setSettings((prev) => ({ ...prev, collections: updatedCollections }));
  }

  function surpriseMe() {
    const pool = visible.length > 0 ? visible : library.filter((i) => i.category === 'game');
    if (pool.length === 0) {
      showToast('Nothing to pick from yet.', 'info');
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setSelectedItem(pick);
    showToast(`How about ${pick.name}?`, 'info');
  }

  if (loading) {
    return (
      <div className="wizard-shell splash-shell">
        <div className="splash">
          <div className="splash-logo"><Logo size={88} /></div>
          <div className="splash-name">Playnest</div>
          <div className="splash-tagline">{t('splash.tagline')}</div>
          <div className="splash-bar"><div className="splash-bar-fill" /></div>
        </div>
      </div>
    );
  }

  if (fatalError) {
    return (
      <div className="wizard-shell">
        <div className="wizard-card" style={{ textAlign: 'center' }}>
          <div className="wizard-logo"><Logo size={40} /></div>
          <h1>{t('error.errorTitle')}</h1>
          <p className="sub">{t('error.errorBody')}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>{t('error.restart')}</button>
        </div>
      </div>
    );
  }

  if (showWizard) {
    return (
      <SetupWizard
        settings={settings}
        onLanguageChange={(lang) => updateSettings({ language: lang })}
        onFinished={async () => {
          await loadLibrary();
          if (!settings.setupWizardSeen) await updateSettings({ setupWizardSeen: true });
          setShowWizard(false);
        }}
        onSkip={async () => {
          if (!settings.setupWizardSeen) await updateSettings({ setupWizardSeen: true });
          setShowWizard(false);
        }}
      />
    );
  }

  const groupBy = settings.groupBy || 'none';
  const groups = groupBy !== 'none' ? groupItems(visible, groupBy) : null;
  // A whitelist, not a blacklist — every new non-library view (a tool/settings page)
  // used to have to be added here by hand, and the library grid silently rendered
  // underneath any view we forgot to add (this is exactly what happened with the
  // Tools section pages). Checking what IS a library view instead of what isn't
  // means a new tool page is safe by default.
  const isLibraryView = view === 'all' || view === 'games' || view === 'applications' || view === 'favorites' || view === 'system' || view === 'hidden' || view.startsWith('collection:');
  const emptyCopy = emptyStateFor(view);

  return (
    <div className="app-shell">
      <Sidebar active={view} onSelect={setView} library={library} settings={settings} onNewCollection={createCollection} />

      <div className="main-area">
        {updateInfo?.hasUpdate && updateInfo.latestVersion !== settings.updateBannerDismissedVersion && (
          <div className="update-banner">
            <span>{t('update.available', { version: updateInfo.latestVersion || '' })}</span>
            <div className="update-banner-actions">
              {updateInfo.downloadUrl && (
                <a className="btn btn-primary" href={updateInfo.downloadUrl} target="_blank" rel="noreferrer" style={{ padding: '6px 14px', fontSize: 13 }}>
                  {t('update.download')}
                </a>
              )}
              <button
                className="btn-link"
                onClick={() => updateSettings({ updateBannerDismissedVersion: updateInfo.latestVersion })}
              >
                {t('update.dismiss')}
              </button>
            </div>
          </div>
        )}
        <div className="topbar">
          <SearchBar
            value={search}
            onChange={setSearch}
            library={library}
            inputRef={searchInputRef}
            placeholder={t('topbar.searchPlaceholder')}
          />
          <div className="topbar-actions">
            <button
              className="icon-btn"
              title={t('topbar.language')}
              onClick={() => updateSettings({ language: settings.language === 'en' ? 'he' : 'en' })}
            >
              <Icon name="language" />
            </button>
            {isLibraryView && (
              <button className="icon-btn" title={t('topbar.surpriseMe')} onClick={surpriseMe}><Icon name="dice" /></button>
            )}
            {isLibraryView && (
              <button
                className={`icon-btn ${selectMode ? 'active' : ''}`}
                title={t('topbar.selectMultiple')}
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              >
                <Icon name="checklist" />
              </button>
            )}
            {isLibraryView && <FilterMenu settings={settings} onChange={updateSettings} />}
            <button className="icon-btn" title={t('topbar.rescan')} onClick={() => setShowWizard(true)}><Icon name="refresh" /></button>
          </div>
        </div>

        <div className="content-scroll">
          {view === 'settings' && <SettingsPanel library={library} settings={settings} onSettingsChanged={setSettings} onRescan={() => setShowWizard(true)} onLibraryChanged={loadLibrary} />}
          {view === 'hardware' && <HardwarePanel />}
          {view === 'storage' && <StorageView library={library} onOpenItem={setSelectedItem} />}
          {view === 'analytics' && <AnalyticsView library={library} />}
          {view === 'recommendations' && <RecommendationsView library={library} onOpenItem={setSelectedItem} />}
          {view === 'insights' && <InsightsView library={library} hardware={hardware} />}
          {view === 'performance' && <PerformanceMode />}
          {view === 'streak' && <StreakTracker />}
          {view === 'benchmark' && <SystemMonitor />}

          {isLibraryView && (
            <>
              {visible.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon"><Icon name={emptyCopy.icon} size={34} /></div>
                  <div style={{ fontSize: 16, color: 'var(--text)' }}>{t(emptyCopy.titleKey)}</div>
                  <div className="hint">{t(emptyCopy.hintKey)}</div>
                </div>
              )}

              {groups
                ? groups.map((group) => (
                    <CategoryRow
                      key={group.label}
                      title={group.label}
                      subtitle={`${group.items.length} items`}
                      items={group.items}
                      onOpen={openItem}
                      layout="row"
                      selectMode={selectMode}
                      selectedIds={selectedIds}
                      density={settings.gridDensity}
                    />
                  ))
                : visible.length > 0 && (
                    <CategoryRow title="" items={visible} onOpen={openItem} layout="grid" selectMode={selectMode} selectedIds={selectedIds} density={settings.gridDensity} />
                  )}
            </>
          )}
        </div>
      </div>

      {selectMode && (
        <div className="bulk-action-bar">
          <span>{selectedIds.size} selected</span>
          <button className="btn btn-secondary" disabled={selectedIds.size === 0} onClick={() => bulkFavorite(true)}>★ Favorite</button>
          <button className="btn btn-secondary" disabled={selectedIds.size === 0} onClick={() => bulkHide(view !== 'hidden')}>
            {view === 'hidden' ? 'Unhide' : 'Hide'}
          </button>
          <button className="btn btn-danger" disabled={selectedIds.size === 0} onClick={() => setConfirmBulkUninstall(true)}>Uninstall</button>
          <button className="btn btn-secondary" onClick={exitSelectMode}>Done</button>
        </div>
      )}

      {selectedItem && (
        <DetailModal
          item={selectedItem}
          library={library}
          hardware={hardware}
          collections={settings.collections}
          onClose={() => setSelectedItem(null)}
          onOpenItem={setSelectedItem}
          onLaunch={(id) => handleAction('launch', id)}
          onOpenFolder={(id) => handleAction('openFolder', id)}
          onUninstall={(id) => setConfirmUninstallId(id)}
          onToggleFavorite={handleToggleFavorite}
          onToggleHidden={handleToggleHidden}
          onToggleCollection={handleToggleCollection}
        />
      )}

      {confirmUninstallId && (
        <ConfirmDialog
          title="Uninstall this item?"
          message={`This runs ${library.find((i) => i.id === confirmUninstallId)?.name || 'this item'}'s own uninstaller. Playnest just removes it from your library afterward — your files and settings for it are handled by that uninstaller, not by Playnest.`}
          confirmLabel="Uninstall"
          danger
          onConfirm={confirmUninstall}
          onCancel={() => setConfirmUninstallId(null)}
        />
      )}

      {confirmBulkUninstall && (
        <ConfirmDialog
          title={`Uninstall ${selectedIds.size} items?`}
          message="This runs each item's own uninstaller in turn. Playnest just removes them from your library afterward — nothing else is deleted by Playnest itself."
          confirmLabel="Uninstall All"
          danger
          onConfirm={bulkUninstall}
          onCancel={() => setConfirmBulkUninstall(false)}
        />
      )}

      <HelpOverlay open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
