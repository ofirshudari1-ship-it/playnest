import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { LibraryItem } from '../../types';
import { sourceLabel, formatBytes, isRecentlyAdded, STATUS_ICON, statusLabel } from '../../helpers';
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
  // Cover art can come from a slow first-time fetch (Settings → "Fetch cover
  // art"), so the grid shows a pulsing skeleton in its place instead of a
  // blank tile until the <img> actually decodes.
  const [coverLoaded, setCoverLoaded] = useState(false);

  async function quickLaunch(e: MouseEvent) {
    e.stopPropagation();
    const result = await window.playnest.launchItem(item.id);
    if (!result.ok) showToast(result.error || 'Could not launch this item.', 'error');
  }

  // Cards are the primary way to reach anything in the library grid, so they
  // must be reachable and operable without a mouse: focusable in normal tab
  // order, and Enter/Space activate them exactly like a click (native <button>
  // semantics on a non-<button> element per WAI-ARIA button pattern).
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Only when the card itself has focus. Keydowns from the nested ▶ button
    // bubble up here too — previously Enter/Space on that button hit this
    // handler, whose preventDefault() cancelled the button's own activation
    // and opened the detail modal instead of launching the game.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(item);
    }
  }

  return (
    <div
      className={`game-card ${selectMode ? 'select-mode' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={() => onOpen(item)}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
      aria-pressed={selectMode ? !!isSelected : undefined}
      aria-label={item.completionStatus ? `${item.name} — ${statusLabel(item.completionStatus)}` : item.name}
    >
      {selectMode && <span className="select-check">{isSelected ? '✓' : ''}</span>}
      <span className="source-badge">{sourceLabel(item.source)}</span>
      {!selectMode && item.isFavorite && <span className="fav-badge">⭐</span>}
      {!selectMode && item.completionStatus && (
        <span className={`status-badge status-${item.completionStatus}`} title={statusLabel(item.completionStatus)}>
          {STATUS_ICON[item.completionStatus]}
        </span>
      )}
      {showNewBadge && <span className="new-badge" title={t('card.newTitle')}>{t('card.new')}</span>}
      {item.coverArt ? (
        <>
          {!coverLoaded && <div className="cover skeleton" aria-hidden="true" />}
          <img
            className="cover"
            src={item.coverArt}
            alt={item.name}
            loading="lazy"
            style={coverLoaded ? undefined : { display: 'none' }}
            onLoad={() => setCoverLoaded(true)}
            onError={() => setCoverLoaded(true)}
          />
        </>
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
