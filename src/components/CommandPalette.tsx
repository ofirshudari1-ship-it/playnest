import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryItem } from '../types';
import type { ViewKey } from './Sidebar';
import { useTranslation } from '../i18n';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface Props {
  library: LibraryItem[];
  actions: PaletteAction[];
  hiddenIds: string[];
  onLaunch: (item: LibraryItem) => void;
  onClose: () => void;
}

export type PaletteView = ViewKey;

// Ctrl+K: one box to launch a game, jump to a screen or flip a setting.
// Games match on a simple case-insensitive substring so results feel instant
// on large libraries; actions match on label.
export default function CommandPalette({ library, actions, hiddenIds, onLaunch, onClose }: Props) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const acts = actions
      .filter((a) => !q || a.label.toLowerCase().includes(q))
      .map((a) => ({ key: a.id, label: a.label, hint: a.hint ?? t('palette.action'), run: a.run }));
    const games = q
      ? library
          .filter((i) => !hiddenIds.includes(i.id) && i.name.toLowerCase().includes(q))
          .slice(0, 8)
          .map((i) => ({ key: `g:${i.id}`, label: i.name, hint: t('palette.launch'), run: () => onLaunch(i) }))
      : [];
    return [...games, ...acts].slice(0, 12);
  }, [query, library, actions, hiddenIds, onLaunch, t]);

  useEffect(() => { setIndex(0); }, [query]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[index];
      if (row) { onClose(); row.run(); }
    } else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label={t('palette.title')} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          placeholder={t('palette.placeholder')}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list" role="listbox">
          {rows.length === 0 && <div className="palette-empty">{t('palette.empty')}</div>}
          {rows.map((r, i) => (
            <button
              key={r.key}
              role="option"
              aria-selected={i === index}
              className={`palette-row ${i === index ? 'active' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => { onClose(); r.run(); }}
            >
              <span>{r.label}</span>
              <span className="palette-hint">{r.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
