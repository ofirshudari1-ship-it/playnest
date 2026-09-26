import { useEffect, useRef, useState } from 'react';
import type { Category, CompletionStatus, GridDensity, Settings } from '../types';
import { useTranslation } from '../i18n';
import { COMPLETION_STATUSES, STATUS_LABEL_KEYS } from '../helpers';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

const CATEGORY_KEYS: Record<Category, string> = {
  game: 'sidebar.games',
  application: 'sidebar.applications',
  system: 'sidebar.system'
};

const DENSITY_KEYS: Record<GridDensity, string> = {
  compact: 'filterMenu.densityCompact',
  comfortable: 'filterMenu.densityComfortable',
  large: 'filterMenu.densityLarge'
};

export default function FilterMenu({ settings, onChange }: Props) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function toggleCategory(category: Category) {
    const hidden = new Set(settings.hiddenCategories);
    if (hidden.has(category)) hidden.delete(category);
    else hidden.add(category);
    onChange({ hiddenCategories: [...hidden] });
  }

  return (
    <div className="filter-menu-wrap" ref={ref}>
      <button className="icon-btn" title={t('filterMenu.title')} onClick={() => setOpen((v) => !v)}>⚙</button>
      {open && (
        <div className="filter-dropdown">
          <div className="field">
            <label>{t('filterMenu.groupBy')}</label>
            <select
              value={settings.groupBy}
              onChange={(e) => onChange({ groupBy: e.target.value as Settings['groupBy'] })}
            >
              <option value="none">{t('filterMenu.groupByNone')}</option>
              <option value="genre">{t('filterMenu.groupByGenre')}</option>
              <option value="size">{t('filterMenu.groupBySize')}</option>
              <option value="year">{t('filterMenu.groupByYear')}</option>
              <option value="status">{t('filterMenu.groupByStatus')}</option>
            </select>
          </div>

          <div className="field">
            <label>{t('filterMenu.statusFilter')}</label>
            <select
              value={settings.statusFilter}
              onChange={(e) => onChange({ statusFilter: e.target.value as Settings['statusFilter'] })}
            >
              <option value="all">{t('filterMenu.statusAll')}</option>
              {COMPLETION_STATUSES.map((status: CompletionStatus) => (
                <option key={status} value={status}>{t(STATUS_LABEL_KEYS[status])}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>{t('filterMenu.sortBy')}</label>
            <select
              value={settings.sortBy}
              onChange={(e) => onChange({ sortBy: e.target.value as Settings['sortBy'] })}
            >
              <option value="name">{t('filterMenu.sortByName')}</option>
              <option value="size">{t('filterMenu.sortBySize')}</option>
              <option value="recent">{t('filterMenu.sortByRecent')}</option>
              <option value="playtime">{t('filterMenu.sortByPlaytime')}</option>
              <option value="lastPlayed">{t('filterMenu.sortByLastPlayed')}</option>
            </select>
          </div>

          <div className="field">
            <label>{t('filterMenu.density')}</label>
            <div className="theme-toggle-row">
              {(Object.keys(DENSITY_KEYS) as GridDensity[]).map((density) => (
                <button
                  key={density}
                  type="button"
                  className={`theme-option ${settings.gridDensity === density ? 'active' : ''}`}
                  onClick={() => onChange({ gridDensity: density })}
                >
                  {t(DENSITY_KEYS[density])}
                </button>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('filterMenu.showIn')}</label>
            {(Object.keys(CATEGORY_KEYS) as Category[]).map((category) => (
              <label className="checkbox-row" key={category}>
                <input
                  type="checkbox"
                  checked={!settings.hiddenCategories.includes(category)}
                  onChange={() => toggleCategory(category)}
                />
                {t(CATEGORY_KEYS[category])}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
