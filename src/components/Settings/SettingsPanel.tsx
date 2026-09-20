import { useEffect, useState } from 'react';
import type { LibraryItem, Settings, StaleItem, Theme, Language } from '../../types';
import { showToast } from '../../toast';
import { timeAgo, formatPlaytime } from '../../helpers';
import { useTranslation } from '../../i18n';

interface Props {
  library: LibraryItem[];
  settings: Settings;
  onSettingsChanged: (settings: Settings) => void;
  onRescan: () => void;
  onLibraryChanged: () => void;
}

export default function SettingsPanel({ library, settings, onSettingsChanged, onRescan, onLibraryChanged }: Props) {
  const t = useTranslation();
  const [apiKeyInput, setApiKeyInput] = useState(settings.steamGridApiKey || '');
  const [appInfo, setAppInfo] = useState<{ name: string; version: string; buildDate: string | null } | null>(null);
  const [saved, setSaved] = useState(false);
  const [fetchingArt, setFetchingArt] = useState(false);
  const [artLog, setArtLog] = useState<string[]>([]);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [staleItems, setStaleItems] = useState<StaleItem[] | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [renaming, setRenaming] = useState<{ name: string; value: string } | null>(null);

  useEffect(() => {
    window.playnest.appInfo().then(setAppInfo);
    window.playnest.getLastScan().then(setLastScan);
  }, []);

  useEffect(() => {
    if (!fetchingArt) return undefined;
    return window.playnest.onArtProgress((msg) => setArtLog((prev) => [...prev.slice(-6), msg.message]));
  }, [fetchingArt]);

  async function patchSettings(patch: Partial<Settings>) {
    const updated = await window.playnest.setSettings(patch);
    onSettingsChanged(updated);
    return updated;
  }

  async function saveKey() {
    await patchSettings({ steamGridApiKey: apiKeyInput });
    setSaved(true);
    showToast('SteamGridDB key saved.', 'success');
    setTimeout(() => setSaved(false), 2000);
  }

  async function fetchArt() {
    setFetchingArt(true);
    setArtLog(['Starting...']);
    const result = await window.playnest.fetchMissingArt();
    if (!result.ok) {
      setArtLog((prev) => [...prev, result.error || 'Could not fetch cover art.']);
      showToast(result.error || 'Could not fetch cover art.', 'error');
    } else {
      showToast(`Found artwork for ${result.fetched} of ${result.total} items.`, 'success');
    }
    setFetchingArt(false);
    onLibraryChanged();
  }

  async function runVerify() {
    setVerifying(true);
    const stale = await window.playnest.verifyLibrary();
    setStaleItems(stale);
    setVerifying(false);
    showToast(
      stale.length === 0 ? 'Everything checks out — no missing installs.' : `Found ${stale.length} item(s) that no longer exist on disk.`,
      stale.length === 0 ? 'success' : 'info'
    );
  }

  async function removeStale(ids: string[]) {
    await window.playnest.removeItems(ids);
    setStaleItems((prev) => (prev ? prev.filter((i) => !ids.includes(i.id)) : prev));
    onLibraryChanged();
    showToast(`Removed ${ids.length} item(s) from your library.`, 'success');
  }

  async function exportBackup() {
    const result = await window.playnest.exportLibrary();
    if (result.ok) showToast(`Backup saved to ${result.path}`, 'success');
    else if (result.error) showToast(result.error, 'error');
  }

  async function importBackup() {
    const result = await window.playnest.importLibrary();
    if (result.ok) {
      showToast(`Restored ${result.imported} item(s) from backup.`, 'success');
      onLibraryChanged();
      window.playnest.getSettings().then(onSettingsChanged);
    } else if (result.error) {
      showToast(result.error, 'error');
    }
  }

  async function deleteCollection(name: string) {
    const updated = await window.playnest.deleteCollection(name);
    onSettingsChanged({ ...settings, collections: updated });
    showToast(`Deleted "${name}".`, 'success');
  }

  async function commitRename() {
    if (!renaming) return;
    const { name, value } = renaming;
    const trimmed = value.trim();
    setRenaming(null);
    if (!trimmed || trimmed === name) return;
    const updated = await window.playnest.renameCollection(name, trimmed);
    onSettingsChanged({ ...settings, collections: updated });
  }

  const counts = {
    total: library.length,
    game: library.filter((i) => i.category === 'game').length,
    application: library.filter((i) => i.category === 'application').length,
    system: library.filter((i) => i.category === 'system').length
  };
  const totalPlaytimeMinutes = library.reduce((sum, i) => sum + (i.totalPlaytimeMinutes || 0), 0);
  const collectionNames = Object.keys(settings.collections || {});

  const THEME_LABELS: Record<Theme, string> = {
    system: t('settings.themeSystem'),
    dark: t('settings.themeDark'),
    light: t('settings.themeLight')
  };
  const THEME_ICONS: Record<Theme, string> = { system: '🖥️', dark: '🌙', light: '☀️' };

  return (
    <div className="settings-panel">
      <h1>{t('settings.title')}</h1>

      <div className="stat-tiles">
        <div className="stat-tile"><div className="n">{counts.total}</div><div className="l">{t('settings.statTotalItems')}</div></div>
        <div className="stat-tile"><div className="n">{counts.game}</div><div className="l">{t('settings.statGames')}</div></div>
        <div className="stat-tile"><div className="n">{formatPlaytime(totalPlaytimeMinutes).replace(' played', '')}</div><div className="l">{t('settings.statPlaytime')}</div></div>
        <div className="stat-tile"><div className="n">{timeAgo(lastScan)}</div><div className="l">{t('settings.statLastScanned')}</div></div>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">{t('settings.sectionGeneral')}</h2>

        <div className="field">
          <label>{t('settings.appearance')}</label>
          <div className="theme-toggle-row">
            {(['system', 'dark', 'light'] as Theme[]).map((themeOption) => (
              <button
                key={themeOption}
                className={`theme-option ${settings.theme === themeOption ? 'active' : ''}`}
                onClick={() => patchSettings({ theme: themeOption })}
              >
                {THEME_ICONS[themeOption]} {THEME_LABELS[themeOption]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>{t('settings.languageLabel')}</label>
          <div className="theme-toggle-row">
            {(['en', 'he'] as Language[]).map((lang) => (
              <button
                key={lang}
                className={`theme-option ${settings.language === lang ? 'active' : ''}`}
                onClick={() => patchSettings({ language: lang })}
              >
                {lang === 'en' ? 'English' : 'עברית'}
              </button>
            ))}
          </div>
          <div className="hint">{t('settings.languageHint')}</div>
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">{t('settings.sectionLibrary')}</h2>

      <div className="field">
        <label>{t('settings.apiKeyLabel')}</label>
        <input
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder={t('settings.apiKeyPlaceholder')}
        />
        <div className="hint">
          {t('settings.apiKeyHint')}{' '}
          <a href="https://www.steamgriddb.com/profile/preferences/api" target="_blank" rel="noreferrer">
            {t('settings.apiKeyLink')}
          </a>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={saveKey}>{t('settings.saveKey')}</button>
          {saved && <span style={{ color: 'var(--success)', fontSize: 13 }}>{t('settings.saved')}</span>}
        </div>
      </div>

      <div className="field">
        <label>{t('settings.coverArtLabel')}</label>
        <div className="hint" style={{ marginBottom: 10 }}>{t('settings.coverArtHint')}</div>
        <button className="btn btn-secondary" onClick={fetchArt} disabled={fetchingArt}>
          {fetchingArt ? t('settings.fetchingArt') : t('settings.fetchArt')}
        </button>
        {artLog.length > 0 && (
          <div className="progress-log" style={{ height: 'auto', maxHeight: 140, marginTop: 12 }}>
            {artLog.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        )}
      </div>

      <div className="field">
        <label>{t('settings.libraryHealthLabel')}</label>
        <div className="hint" style={{ marginBottom: 10 }}>{t('settings.libraryHealthHint')}</div>
        <button className="btn btn-secondary" onClick={runVerify} disabled={verifying}>
          {verifying ? t('settings.verifying') : t('settings.verifyLibrary')}
        </button>

        {staleItems && staleItems.length > 0 && (
          <>
            <div className="verify-list">
              {staleItems.map((item) => (
                <div className="verify-list-row" key={item.id}>
                  <span>{item.name}</span>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => removeStale([item.id])}>
                    {t('common.remove')}
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn btn-danger"
              style={{ marginTop: 10 }}
              onClick={() => removeStale(staleItems.map((i) => i.id))}
            >
              {t('settings.removeAllMissing', { count: staleItems.length })}
            </button>
          </>
        )}
      </div>

      {collectionNames.length > 0 && (
        <div className="field">
          <label>{t('settings.manageCollections')}</label>
          <div className="verify-list">
            {collectionNames.map((name) => (
              <div className="verify-list-row" key={name}>
                {renaming?.name === name ? (
                  <input
                    autoFocus
                    value={renaming.value}
                    onChange={(e) => setRenaming({ name, value: e.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 8px', color: 'var(--text)', fontSize: 13 }}
                  />
                ) : (
                  <span>{name} ({settings.collections[name]?.length || 0})</span>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setRenaming({ name, value: name })}>{t('common.rename')}</button>
                  <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => deleteCollection(name)}>{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label>{t('settings.backupLabel')}</label>
        <div className="hint" style={{ marginBottom: 10 }}>{t('settings.backupHint')}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={exportBackup}>{t('settings.exportBackup')}</button>
          <button className="btn btn-secondary" onClick={importBackup}>{t('settings.importBackup')}</button>
        </div>
      </div>

      <div className="field">
        <label>{t('settings.libraryLabel')}</label>
        <div className="hint" style={{ marginBottom: 10 }}>{t('settings.libraryHint')}</div>
        <button className="btn btn-secondary" onClick={onRescan}>{t('settings.runWizardAgain')}</button>
      </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">{t('settings.sectionSystem')}</h2>

        <div className="field">
          <label>{t('settings.startupLabel')}</label>
          <div className="toggle-row" style={{ padding: 0 }}>
            <div>
              <div>{t('settings.launchOnStartupTitle')}</div>
              <div className="desc">{t('settings.launchOnStartupDesc')}</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.launchOnStartup}
                onChange={(e) => patchSettings({ launchOnStartup: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>
          <div className={`toggle-row ${settings.launchOnStartup ? '' : 'toggle-row-disabled'}`} style={{ padding: 0, marginTop: 12 }}>
            <div>
              <div>{t('settings.startMinimizedTitle')}</div>
              <div className="desc">{t('settings.startMinimizedDesc')}</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.startMinimized}
                disabled={!settings.launchOnStartup}
                onChange={(e) => patchSettings({ startMinimized: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>
        </div>

        <div className="field">
          <label>{t('settings.trayLabel')}</label>
          <div className="toggle-row" style={{ padding: 0 }}>
            <div>
              <div>{t('settings.trayTitle')}</div>
              <div className="desc">{t('settings.trayDesc')}</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={settings.minimizeToTray} onChange={(e) => patchSettings({ minimizeToTray: e.target.checked })} />
              <span className="slider" />
            </label>
          </div>

          <div className={`toggle-row ${settings.minimizeToTray ? '' : 'toggle-row-disabled'}`} style={{ padding: 0, marginTop: 12 }}>
            <div>
              <div>{t('settings.trayClickTitle')}</div>
              <div className="desc">{t('settings.trayClickDesc')}</div>
            </div>
            <select
              value={settings.trayClickAction}
              disabled={!settings.minimizeToTray}
              onChange={(e) => patchSettings({ trayClickAction: e.target.value as Settings['trayClickAction'] })}
            >
              <option value="single">{t('settings.trayClickSingle')}</option>
              <option value="double">{t('settings.trayClickDouble')}</option>
            </select>
          </div>

          <div className="toggle-row" style={{ padding: 0, marginTop: 12 }}>
            <div>
              <div>{t('settings.backgroundNotifTitle')}</div>
              <div className="desc">{t('settings.backgroundNotifDesc')}</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.backgroundActivityNotifications}
                onChange={(e) => patchSettings({ backgroundActivityNotifications: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>
        </div>

        <div className="field">
          <label>{t('settings.autoRescanLabel')}</label>
          <div className="hint" style={{ marginBottom: 10 }}>{t('settings.autoRescanHint')}</div>
          <select
            value={settings.autoRescanHours}
            onChange={(e) => patchSettings({ autoRescanHours: Number(e.target.value) })}
          >
            <option value={0}>{t('settings.autoRescanOff')}</option>
            <option value={24}>{t('settings.autoRescanDaily')}</option>
            <option value={168}>{t('settings.autoRescanWeekly')}</option>
          </select>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label>{t('settings.quickLaunchLabel')}</label>
          <div className="toggle-row" style={{ padding: 0 }}>
            <div>
              <div>{t('settings.quickLaunchTitle')}</div>
              <div className="desc">{t('settings.quickLaunchDesc')}</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.quickLaunchHotkeyEnabled}
                onChange={(e) => patchSettings({ quickLaunchHotkeyEnabled: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">{t('settings.sectionAbout')}</h2>

        <div className="field">
          <div className="hint">
            {appInfo?.name || 'Playnest'} version {appInfo?.version || '1.0.0'}
            {appInfo?.buildDate && <> &middot; {t('settings.aboutBuildDate', { date: appInfo.buildDate })}</>}
            <br />
            {t('settings.aboutDeveloped')} &middot; support@playnest.app
            <br />
            <button className="btn-link" onClick={() => window.playnest.openChangelog()}>{t('settings.aboutChangelog')}</button>
          </div>
        </div>

        <details className="settings-details">
          <summary>{t('settings.privacyDetailsToggle')}</summary>
          <div className="field">
            <label>{t('settings.smartFeaturesLabel')}</label>
            <div className="hint">{t('settings.smartFeaturesHint')}</div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('settings.privacyLabel')}</label>
            <div className="hint">{t('settings.privacyHint')}</div>
          </div>
        </details>
      </div>
    </div>
  );
}
