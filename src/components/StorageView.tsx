import { useEffect, useState } from 'react';
import type { DriveUsage, LibraryItem } from '../types';
import { formatBytes } from '../helpers';

interface Props {
  library: LibraryItem[];
  onOpenItem: (item: LibraryItem) => void;
}

export default function StorageView({ library, onOpenItem }: Props) {
  const [usage, setUsage] = useState<DriveUsage[] | null>(null);

  useEffect(() => {
    window.playnest.getDriveUsage().then(setUsage);
  }, [library]);

  const largest = [...library]
    .filter((i) => i.sizeBytes && i.sizeBytes > 0)
    .sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0))
    .slice(0, 12);

  const maxBytes = usage && usage.length > 0 ? usage[0].totalBytes : 1;

  return (
    <div className="wide-panel">
      <h1>Storage</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
        Where your library's disk space is going, so you know what to clear out first.
      </p>

      <div className="field">
        <label>By Drive</label>
        {!usage && <div className="hint">Loading...</div>}
        {usage && usage.length === 0 && <div className="hint">No sized items with a known drive yet.</div>}
        {usage?.map((d) => (
          <div className="drive-usage-row" key={d.drive}>
            <div className="drive-usage-label">
              <span className="name">{d.drive}\ &middot; {d.itemCount} item{d.itemCount === 1 ? '' : 's'}</span>
              <span className="amount">{formatBytes(d.totalBytes)}</span>
            </div>
            <div className="drive-usage-bar-track">
              <div className="drive-usage-bar-fill" style={{ width: `${Math.max(4, (d.totalBytes / maxBytes) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="field">
        <label>Largest Items</label>
        <div className="hint" style={{ marginBottom: 6 }}>The biggest space users in your library — good candidates if you need to free up room.</div>
        <div className="verify-list" style={{ maxHeight: 460 }}>
          {largest.map((item, i) => (
            <div
              className="largest-items-row"
              key={item.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onOpenItem(item)}
            >
              <span className="rank">{i + 1}</span>
              <span className="name">{item.name}</span>
              <span className="size">{formatBytes(item.sizeBytes)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
