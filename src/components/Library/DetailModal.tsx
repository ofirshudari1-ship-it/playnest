import { useState } from 'react';
import type { HardwareProfile, LibraryItem } from '../../types';
import { formatBytes, formatPlaytime, timeAgo, sourceLabel, similarItems, performanceVerdict } from '../../helpers';
import GameCard from './GameCard';

interface Props {
  item: LibraryItem;
  library: LibraryItem[];
  hardware: HardwareProfile | null;
  collections: Record<string, string[]>;
  onClose: () => void;
  onOpenItem: (item: LibraryItem) => void;
  onLaunch: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onUninstall: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onToggleCollection: (collectionName: string, itemId: string) => void;
}

export default function DetailModal({
  item, library, hardware, collections, onClose, onOpenItem, onLaunch, onOpenFolder,
  onUninstall, onToggleFavorite, onToggleHidden, onToggleCollection
}: Props) {
  const [showCollections, setShowCollections] = useState(false);
  const similar = similarItems(item, library);
  const verdict = item.category === 'game'
    ? performanceVerdict(item.genre, (hardware?.gpu.tier as any) || 'Unknown')
    : null;
  const collectionNames = Object.keys(collections);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-x" onClick={onClose}>✕</button>
        <div className="modal-hero">
          {item.coverArt ? (
            <img className="cover-lg" src={item.coverArt} alt={item.name} />
          ) : (
            <div className="cover-lg cover-placeholder" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
              {item.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 26 }}>{item.name}</h1>
            <div>
              <span className="tag">{sourceLabel(item.source)}</span>
              {item.genre && <span className="tag">{item.genre}</span>}
              {item.publisher && <span className="tag">{item.publisher}</span>}
            </div>

            {item.category === 'game' && (
              <div className="playtime-badge">
                {formatPlaytime(item.totalPlaytimeMinutes)}
                {item.lastPlayedAt && ` · last played ${timeAgo(item.lastPlayedAt)}`}
              </div>
            )}

            {verdict && hardware && (
              <div style={{ marginTop: 14, fontSize: 14 }}>
                <strong style={{
                  color: verdict.tone === 'good' ? 'var(--success)' : verdict.tone === 'ok' ? 'var(--warning)' : 'var(--danger)'
                }}>
                  {verdict.label}
                </strong>
                <div style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 2 }}>
                  Based on your {hardware.gpu.tier} GPU ({hardware.gpu.model})
                </div>
              </div>
            )}

            <div className="action-row" style={{ marginTop: 18, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => onLaunch(item.id)}>▶ Play</button>
              <button className="btn btn-secondary" onClick={() => onToggleFavorite(item.id)}>
                {item.isFavorite ? '★ Favorited' : '☆ Favorite'}
              </button>
              <button className="btn btn-secondary" onClick={() => onOpenFolder(item.id)}>Open Folder</button>
              <button className="btn btn-secondary" onClick={() => setShowCollections((v) => !v)}>🏷️ Collections</button>
            </div>

            {showCollections && (
              <div className="collection-chip-list">
                {collectionNames.length === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                    No collections yet — create one from the sidebar.
                  </span>
                )}
                {collectionNames.map((name) => {
                  const active = (collections[name] || []).includes(item.id);
                  return (
                    <button
                      key={name}
                      className={`collection-chip ${active ? 'active' : ''}`}
                      onClick={() => onToggleCollection(name, item.id)}
                    >
                      {active ? '✓ ' : '+ '}{name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="modal-body">
          <div className="stat-row">
            <div className="stat"><div className="label">Size on disk</div><div className="value">{formatBytes(item.sizeBytes)}</div></div>
            <div className="stat"><div className="label">Install path</div><div className="value" style={{ fontSize: 12 }}>{item.installPath || 'Unknown'}</div></div>
            {item.version && <div className="stat"><div className="label">Version</div><div className="value">{item.version}</div></div>}
            {item.releaseYear && <div className="stat"><div className="label">Release Year</div><div className="value">{item.releaseYear}</div></div>}
          </div>

          {similar.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="category-row-header"><h2 style={{ fontSize: 15 }}>Similar in your library</h2></div>
              <div className="card-track">
                {similar.map((s) => <GameCard key={s.id} item={s} onOpen={onOpenItem} />)}
              </div>
            </div>
          )}

          <div className="action-row" style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button className="btn btn-danger" onClick={() => onUninstall(item.id)} disabled={!item.uninstallCommand}>
              Uninstall
            </button>
            <button className="btn btn-secondary" onClick={() => onToggleHidden(item.id)}>
              🙈 Hide from Library
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
