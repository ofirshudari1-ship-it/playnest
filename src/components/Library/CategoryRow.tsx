import type { KeyboardEvent } from 'react';
import type { GridDensity, LibraryItem } from '../../types';
import GameCard from './GameCard';

interface Props {
  title: string;
  subtitle?: string;
  items: LibraryItem[];
  onOpen: (item: LibraryItem) => void;
  layout?: 'row' | 'grid';
  selectMode?: boolean;
  selectedIds?: Set<string>;
  density?: GridDensity;
}

// Arrow-key movement between cards, so a keyboard user isn't limited to
// Tab-ing through every card (and its ▶ button) one by one in a library of
// hundreds. Left/Right follow what's on screen (mirrored in RTL); Up/Down
// jump to the card in the same visual column one row above/below, measured
// from the real layout, so it stays correct for every grid density and
// window width. Tab order itself is unchanged.
function onArrowNavigate(e: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  const target = e.target as HTMLElement;
  if (!target.classList.contains('game-card')) return; // not from the ▶ button etc.
  const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(':scope > .game-card'));
  const index = cards.indexOf(target);
  if (index < 0) return;

  let next = -1;
  const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
  if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = cards.length - 1;
  else if (e.key === 'ArrowRight') next = index + (rtl ? -1 : 1);
  else if (e.key === 'ArrowLeft') next = index + (rtl ? 1 : -1);
  else {
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const down = e.key === 'ArrowDown';
    let best = -1;
    let bestScore = Infinity;
    cards.forEach((card, i) => {
      const r = card.getBoundingClientRect();
      const rowDelta = down ? r.top - rect.top : rect.top - r.top;
      if (rowDelta <= 1) return; // same row or wrong direction
      const score = rowDelta * 10000 + Math.abs(r.left + r.width / 2 - centerX);
      if (score < bestScore) { bestScore = score; best = i; }
    });
    next = best;
  }

  if (next < 0 || next >= cards.length) return;
  e.preventDefault();
  cards[next].focus();
  cards[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export default function CategoryRow({ title, subtitle, items, onOpen, layout = 'row', selectMode, selectedIds, density = 'comfortable' }: Props) {
  if (items.length === 0) return null;
  return (
    <div className={`category-row density-${density}`}>
      {title && (
        <div className="category-row-header">
          <h2>{title}</h2>
          {subtitle && <span className="sub">{subtitle}</span>}
        </div>
      )}
      <div className={layout === 'row' ? 'card-track' : 'card-grid'} onKeyDown={onArrowNavigate}>
        {items.map((item) => (
          <GameCard
            key={item.id}
            item={item}
            onOpen={onOpen}
            selectMode={selectMode}
            isSelected={selectedIds?.has(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
