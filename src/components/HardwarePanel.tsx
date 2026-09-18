import { useEffect, useState } from 'react';
import type { HardwareProfile } from '../types';

export default function HardwarePanel() {
  const [hw, setHw] = useState<HardwareProfile | null>(null);

  useEffect(() => {
    window.playnest.getHardwareProfile().then(setHw);
  }, []);

  if (!hw) return <div className="empty-state">Reading hardware details...</div>;

  return (
    <div>
      <h1>My Hardware</h1>
      <p style={{ color: 'var(--text-dim)' }}>{hw.os}</p>

      <div className="score-ring-wrap">
        <div>
          <div className="hw-label">Overall</div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{hw.overallScore}<span style={{ fontSize: 16, color: 'var(--text-faint)' }}>/100</span></div>
          <div style={{ color: 'var(--accent-2)', fontWeight: 600 }}>{hw.overallLabel}</div>
        </div>
      </div>

      <div className="hw-grid">
        <div className="hw-card">
          <div className="hw-label">Processor</div>
          <div className="hw-value">{hw.cpu.tier}</div>
          <div className="hw-sub">{hw.cpu.model}</div>
          <div className="hw-sub">{hw.cpu.cores} cores</div>
        </div>
        <div className="hw-card">
          <div className="hw-label">Graphics</div>
          <div className="hw-value">{hw.gpu.tier}</div>
          <div className="hw-sub">{hw.gpu.model}</div>
          <div className="hw-sub">{hw.gpu.vramGb} GB VRAM</div>
        </div>
        <div className="hw-card">
          <div className="hw-label">Memory</div>
          <div className="hw-value">{hw.ramLabel}</div>
          <div className="hw-sub">{hw.ramGb} GB RAM</div>
        </div>
        <div className="hw-card">
          <div className="hw-label">Storage</div>
          {hw.storage.slice(0, 3).map((d, i) => (
            <div key={i} className="hw-sub">{d.name || d.type} — {d.sizeGb} GB</div>
          ))}
        </div>
      </div>
    </div>
  );
}
