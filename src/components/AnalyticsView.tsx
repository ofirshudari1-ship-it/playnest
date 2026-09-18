import { useEffect, useState } from 'react';
import type { LibraryAnalytics, LibraryItem } from '../types';
import { formatBytes } from '../helpers';
import { useTranslation } from '../i18n';

interface Props {
  library: LibraryItem[];
}

export default function AnalyticsView({ library }: Props) {
  const t = useTranslation();
  const [analytics, setAnalytics] = useState<LibraryAnalytics | null>(null);

  useEffect(() => {
    window.playnest.getAnalytics(library).then(setAnalytics);
  }, [library]);

  if (!analytics) return <div className="settings-panel"><p>{t('analytics.loading')}</p></div>;

  const playtimeHours = Math.floor(analytics.totalPlaytimeMinutes / 60);
  const playtimeMinutes = analytics.totalPlaytimeMinutes % 60;

  return (
    <div className="settings-panel">
      <h1>{t('analytics.title')}</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>{t('analytics.subtitle')}</p>

      <div className="stats-grid">
        <div className="stat-tile">
          <div className="stat-value">{analytics.totalGames}</div>
          <div className="stat-label">{t('analytics.games')}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{analytics.totalApplications}</div>
          <div className="stat-label">{t('analytics.applications')}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{playtimeHours}h {playtimeMinutes}m</div>
          <div className="stat-label">{t('analytics.totalPlaytime')}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{analytics.unplayedGames}</div>
          <div className="stat-label">{t('analytics.unplayed')}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{formatBytes(analytics.totalLibrarySizeGb * 1e9)}</div>
          <div className="stat-label">{t('analytics.librarySize')}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{Math.round(analytics.averagePlaytimePerGame)}m</div>
          <div className="stat-label">{t('analytics.avgPerGame')}</div>
        </div>
      </div>

      <div className="field">
        <label>{t('analytics.mostPlayedGenres')}</label>
        <div className="genre-bars">
          {analytics.mostPlayedGenres.length === 0 ? (
            <div className="hint">{t('analytics.noPlaytimeData')}</div>
          ) : (
            (() => {
              const maxMinutes = Math.max(...analytics.mostPlayedGenres.map((x) => x.minutes));
              return analytics.mostPlayedGenres.slice(0, 8).map((g) => (
                <div key={g.genre} className="genre-bar-row">
                  <div className="genre-bar-label">{g.genre} ({t('analytics.gamesCount', { count: g.count })})</div>
                  <div className="genre-bar-track">
                    <div
                      className="genre-bar-fill"
                      // No played minutes yet (a freshly-scanned library) means maxMinutes
                      // is 0 — g.minutes / 0 is NaN, and `width: NaN%` is invalid CSS that
                      // renders every bar identically instead of reflecting real
                      // proportions. Fall back to a proportional-by-game-count bar instead
                      // of a meaningless 0% one, so the chart still shows *something* real.
                      style={{
                        width: maxMinutes > 0
                          ? `${(g.minutes / maxMinutes) * 100}%`
                          : `${(g.count / Math.max(...analytics.mostPlayedGenres.map((x) => x.count))) * 100}%`
                      }}
                    />
                  </div>
                  <div className="genre-bar-time">{Math.floor(g.minutes / 60)}h</div>
                </div>
              ));
            })()
          )}
        </div>
      </div>

      <div className="field">
        <label>{t('analytics.topPlayed')}</label>
        {analytics.topGames.length === 0 ? (
          <div className="hint">{t('analytics.noPlaytimeData')}</div>
        ) : (
          <div className="verify-list">
            {analytics.topGames.slice(0, 5).map((game, i) => (
              <div key={game.id} className="largest-items-row">
                <span className="rank">{i + 1}</span>
                <span className="name">{game.name}</span>
                <span className="size">{Math.floor((game.totalPlaytimeMinutes || 0) / 60)}h</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <label>{t('analytics.recentlyPlayed')}</label>
        {analytics.recentlyPlayed.length === 0 ? (
          <div className="hint">{t('analytics.noRecentActivity')}</div>
        ) : (
          <div className="verify-list">
            {analytics.recentlyPlayed.slice(0, 5).map((game) => (
              <div key={game.id} className="largest-items-row">
                <span className="rank" style={{ fontSize: 11 }}>●</span>
                <span className="name">{game.name}</span>
                <span className="size" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {game.lastPlayedAt ? new Date(game.lastPlayedAt).toLocaleDateString() : t('analytics.unknown')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
