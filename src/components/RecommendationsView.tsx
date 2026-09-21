import { useEffect, useState } from 'react';
import type { GameRecommendation, LibraryItem } from '../types';
import { useTranslation } from '../i18n';

interface Props {
  library: LibraryItem[];
  onOpenItem: (item: LibraryItem) => void;
}

export default function RecommendationsView({ library, onOpenItem }: Props) {
  const t = useTranslation();
  const [recommendations, setRecommendations] = useState<GameRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.playnest
      .getRecommendations(library, 12)
      .then(setRecommendations)
      .finally(() => setLoading(false));
  }, [library]);

  return (
    <div className="wide-panel">
      <h1>{t('recommendations.title')}</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>{t('recommendations.subtitle')}</p>

      {loading ? (
        <div className="hint">{t('recommendations.analyzing')}</div>
      ) : recommendations.length === 0 ? (
        <div className="hint">{t('recommendations.playMore')}</div>
      ) : (
        <div className="recommendations-grid">
          {recommendations.map((rec) => (
            <div
              key={rec.item.id}
              className="recommendation-card"
              onClick={() => onOpenItem(rec.item)}
              style={{ cursor: 'pointer' }}
            >
              {rec.item.coverArt && (
                <div className="rec-cover">
                  <img src={rec.item.coverArt} alt={rec.item.name} />
                  <div className="rec-score">{Math.round(rec.score * 100)}%</div>
                </div>
              )}
              {!rec.item.coverArt && (
                <div className="rec-cover-placeholder">
                  <div className="rec-score">{Math.round(rec.score * 100)}%</div>
                </div>
              )}
              <div className="rec-info">
                <div className="rec-name">{rec.item.name}</div>
                <div className="rec-reason">{rec.reason}</div>
                <div className="rec-genre">{rec.item.genre || t('recommendations.unknownGenre')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
