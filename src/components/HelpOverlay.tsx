import { useEffect } from 'react';

const SHORTCUTS = [
  { key: 'Ctrl+K', desc: 'Focus search bar' },
  { key: 'Ctrl+N', desc: 'Create new collection' },
  { key: 'Ctrl+T', desc: 'Toggle dark/light theme' },
  { key: 'Ctrl+/', desc: 'Show this help menu' },
  { key: 'Esc', desc: 'Close modals or exit select mode' },
  { key: '↑ ↓ ← →', desc: 'Navigate items (when applicable)' },
  { key: 'Enter', desc: 'Open selected item or confirm action' },
];

interface HelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

export default function HelpOverlay({ open, onClose }: HelpOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-panel" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <h2>⌨️ Keyboard Shortcuts</h2>
          <button className="help-close" onClick={onClose}>✕</button>
        </div>

        <div className="help-content">
          <div className="shortcuts-grid">
            {SHORTCUTS.map((shortcut, i) => (
              <div key={i} className="shortcut-row">
                <kbd className="shortcut-key">{shortcut.key}</kbd>
                <span className="shortcut-desc">{shortcut.desc}</span>
              </div>
            ))}
          </div>

          <div className="help-tips">
            <h3>💡 Pro Tips</h3>
            <ul>
              <li>Press <kbd>Ctrl+K</kbd> to search, then type to find games instantly</li>
              <li>Create collections with <kbd>Ctrl+N</kbd> to organize your library your way</li>
              <li>Use <kbd>Ctrl+T</kbd> to switch between dark and light themes</li>
              <li>Right-click on game cards for quick actions</li>
              <li>Hold Shift and click to select multiple items for bulk actions</li>
            </ul>
          </div>
        </div>

        <div className="help-footer">
          Press <kbd>Esc</kbd> or click outside to close
        </div>
      </div>
    </div>
  );
}
