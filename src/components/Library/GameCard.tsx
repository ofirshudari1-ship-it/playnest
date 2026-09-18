import type { MouseEvent } from 'react';
import type { LibraryItem } from '../../types';
import { sourceLabel, formatBytes, isRecentlyAdded } from '../../helpers';
import { showToast } from '../../toast';
import { useTranslation } from '../../i18n';

interface Props {
  item: LibraryItem;
  onOpen: (item: LibraryItem) => void;
  selectMode?: boolean;
  isSelected?: boolean;
}

export default function GameCard({ item, onOpen, selectMode, isSelected }: Props) {
  const t = useTranslation();
  const initial = item.name.trim().charAt(0).toUpperCase() || '?';
  const showNewBadge = !selectMode && !item.isFavorite && isRecentlyAdded(item.addedAt);

  async function quickLaunch(e: MouseEvent) {
    e.stopPropagation();
    const result = await window.playnest.launchItem(item.id);
    if (!result.ok) showToast(result.error || 'Could not launch this item.', 'error');
  }

  return (
    <div className={`game-card ${selectMode ? 'select-mode' : ''} ${isSelected ? 'selected' : ''}`} onClick={() => onOpen(item)}>
      {selectMode && <span className="select-check">{isSelected ? '✓' : ''}</span>}
      <span className="source-badge">{sourceLabel(item.source)}</span>
      {!selectMode && item.isFavorite && <span className="fav-badge">⭐</span>}
      {showNewBadge && <span className="new-badge" title={t('card.newTitle')}>{t('card.new')}</span>}
      {item.coverArt ? (
        <img className="cover" src={item.coverArt} alt={item.name} loading="lazy" />
      ) : (
        <div className="cover-placeholder">{initial}</div>
      )}
      {!selectMode && (
        <div className="hover-play">
          <button className="hover-play-btn" title={`Launch ${item.name}`} onClick={quickLaunch}>▶</button>
        </div>
      )}
      <div className="info">
        <div className="title">{item.name}</div>
        <div className="meta">{formatBytes(item.sizeBytes)}</div>
      </div>
    </div>
  );
}
