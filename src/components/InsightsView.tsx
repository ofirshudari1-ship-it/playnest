import { useMemo } from 'react';
import type { LibraryItem } from '../types';
import { useTranslation } from '../i18n';

interface Props {
  library: LibraryItem[];
  hardware: any;
}

export default function InsightsView({ library, hardware }: Props) {
  const t = useTranslation();
  const insights = useMemo(() => {
    const games = library.filter((i) => i.category === 'game');
    const unplayed = games.filter((g) => !g.totalPlaytimeMinutes || g.totalPlaytimeMinutes === 0);
    const backlog = games
      .filter((g) => (g.totalPlaytimeMinutes || 0) < 120)
      .sort((a, b) => (b.releaseYear || 0) - (a.releaseYear || 0));

    const genreCounts: Record<string, { games: LibraryItem[]; playtime: number }> = {};
    games.forEach((g) => {
      const genre = g.genre || 'Other';
      if (!genreCounts[genre]) {
        genreCounts[genre] = { games: [], playtime: 0 };
      }
      genreCounts[genre].games.push(g);
      genreCounts[genre].playtime += g.totalPlaytimeMinutes || 0;
    });

    const favGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1].playtime - a[1].playtime)
      .slice(0, 3);

    return { unplayed, backlog, favGenres, genreCounts };
  }, [library]);

  return (
    <div className="settings-panel">
      <h1>{t('insights.title')}</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>{t('insights.subtitle')}</p>

      <div className="stats-grid">
        <div className="stat-tile">
          <div className="stat-value">{insights.unplayed.length}</div>
          <div className="stat-label">{t('insights.unplayedGames')}</div>
          <div className="stat-hint">{t('insights.readyToPlay')}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{insights.backlog.length}</div>
          <div className="stat-label">{t('insights.shortPlaytime')}</div>
          <div className="stat-hint">{t('insights.under2h')}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{Object.keys(insights.genreCounts).length}</div>
          <div className="stat-label">{t('insights.genres')}</div>
          <div className="stat-hint">{t('insights.inLibrary')}</div>
        </div>
      </div>

      <div className="field">
        <label>{t('insights.favoriteGenres')}</label>
        <div className="genre-breakdown">
          {insights.favGenres.map(([genre, data]) => (
            <div key={genre} className="genre-stat">
              <div className="genre-stat-name">{genre}</div>
              <div className="genre-stat-info">
                <span>{t('insights.gamesCount', { count: data.games.length })}</span>
                <span>•</span>
                <span>{t('insights.hoursPlayed', { hours: Math.floor(data.playtime / 60) })}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{t('insights.quickActions')}</label>
        <div className="insights-actions">
          {insights.unplayed.length > 0 && (
            <div className="insight-suggestion">
              <div className="insight-icon">🎲</div>
              <div className="insight-text">
                <div className="insight-title">{t('insights.timeToPlayTitle')}</div>
                <div className="insight-desc">{t('insights.timeToPlayDesc', { count: insights.unplayed.length })}</div>
              </div>
            </div>
          )}
          {insights.backlog.length > 5 && (
            <div className="insight-suggestion">
              <div className="insight-icon">📚</div>
              <div className="insight-text">
                <div className="insight-title">{t('insights.growingBacklogTitle')}</div>
                <div className="insight-desc">{t('insights.growingBacklogDesc', { count: insights.backlog.length })}</div>
              </div>
            </div>
          )}
          {hardware && (
            <div className="insight-suggestion">
              <div className="insight-icon">⚡</div>
              <div className="insight-text">
                <div className="insight-title">{t('insights.yourHardwareTitle')}</div>
                <div className="insight-desc">
                  {t('insights.yourHardwareDesc', { tier: hardware.overallLabel })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="field">
        <label>{t('insights.topUnplayed')}</label>
        {insights.favGenres.length === 0 ? (
          <div className="hint">{t('insights.playMoreForRecs')}</div>
        ) : (
          <div className="verify-list">
            {insights.favGenres
              .flatMap(([, data]) =>
                data.games
                  .filter((g) => !g.totalPlaytimeMinutes || g.totalPlaytimeMinutes === 0)
                  .slice(0, 2)
              )
              .slice(0, 5)
              .map((game) => (
                <div key={game.id} className="largest-items-row">
                  <span className="rank">★</span>
                  <span className="name">{game.name}</span>
                  <span className="size" style={{ fontSize: 12, color: 'var(--accent)' }}>
                    {game.genre}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
