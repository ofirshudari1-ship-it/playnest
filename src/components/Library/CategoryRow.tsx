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
      <div className={layout === 'row' ? 'card-track' : 'card-grid'}>
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
