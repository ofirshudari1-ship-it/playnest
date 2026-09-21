import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';

interface LiveStats {
  cpuLoad: number | null;
  ramUsedGb: number | null;
  ramTotalGb: number | null;
  ramPercent: number | null;
  cpuTempC: number | null;
  error?: string;
}

export default function SystemMonitor() {
  const t = useTranslation();
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [watching, setWatching] = useState(false);
  const intervalRef = useRef<number | null>(null);

  async function poll() {
    setStats(await window.playnest.getLiveStats());
  }

  useEffect(() => {
    poll();
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  function toggleWatching() {
    if (watching) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      setWatching(false);
    } else {
      poll();
      intervalRef.current = window.setInterval(poll, 2000);
      setWatching(true);
    }
  }

  const barColor = (pct: number | null) => {
    if (pct == null) return 'normal';
    if (pct > 90) return 'critical';
    if (pct > 75) return 'warning';
    return 'normal';
  };

  // Severity must never ride on color alone (colorblind users can't
  // distinguish the green/amber/red text) — every level pairs a small glyph
  // and an accessible label with the color class.
  const STATUS_ICON: Record<string, string> = { normal: '', warning: '▲', critical: '⛔' };
  const statusLabel = (level: string) =>
    level === 'critical' ? t('systemMonitor.statusCritical')
      : level === 'warning' ? t('systemMonitor.statusWarning')
      : t('systemMonitor.statusNormal');

  return (
    <div className="game-benchmark">
      <h2>{t('systemMonitor.title')}</h2>
      <p className="subtitle">{t('systemMonitor.subtitle')}</p>

      {stats?.error && (
        <div className="rec-card">{t('systemMonitor.sensorError', { error: stats.error })}</div>
      )}

      <div className="benchmark-control">
        <button className={`benchmark-btn ${watching ? 'running' : ''}`} onClick={toggleWatching}>
          {watching ? t('systemMonitor.stopLive') : t('systemMonitor.startLive')}
        </button>
      </div>

      <div className="benchmark-results">
        <h3>{t('systemMonitor.currentReadings')}</h3>
        <div className="metrics-grid">
          <div className="metric-box">
            <div className="metric-header">
              <span>{t('systemMonitor.cpuLabel')}</span>
              <span
                className={`value ${barColor(stats?.cpuLoad ?? null)}`}
                title={statusLabel(barColor(stats?.cpuLoad ?? null))}
              >
                {STATUS_ICON[barColor(stats?.cpuLoad ?? null)]} {stats?.cpuLoad != null ? `${stats.cpuLoad}%` : '—'}
              </span>
            </div>
            <div className="meter"><div className="bar" style={{ width: `${stats?.cpuLoad ?? 0}%` }} /></div>
            <div className="metric-desc">{t('systemMonitor.cpuDesc')}</div>
          </div>

          <div className="metric-box">
            <div className="metric-header">
              <span>{t('systemMonitor.ramLabel')}</span>
              <span
                className={`value ${barColor(stats?.ramPercent ?? null)}`}
                title={statusLabel(barColor(stats?.ramPercent ?? null))}
              >
                {STATUS_ICON[barColor(stats?.ramPercent ?? null)]} {stats?.ramPercent != null ? `${stats.ramPercent}%` : '—'}
              </span>
            </div>
            <div className="meter"><div className="bar" style={{ width: `${stats?.ramPercent ?? 0}%` }} /></div>
            <div className="metric-desc">
              {stats?.ramUsedGb != null ? `${stats.ramUsedGb} GB / ${stats.ramTotalGb} GB` : t('systemMonitor.ramDesc')}
            </div>
          </div>

          <div className="metric-box">
            <div className="metric-header">
              <span>{t('systemMonitor.tempLabel')}</span>
              <span
                className={`value ${stats?.cpuTempC && stats.cpuTempC > 80 ? 'warning' : 'good'}`}
                title={statusLabel(stats?.cpuTempC && stats.cpuTempC > 80 ? 'warning' : 'normal')}
              >
                {stats?.cpuTempC && stats.cpuTempC > 80 ? '▲ ' : ''}
                {stats?.cpuTempC != null ? `${stats.cpuTempC}°C` : t('systemMonitor.tempNA')}
              </span>
            </div>
            <div className="meter"><div className="bar" style={{ width: `${stats?.cpuTempC ? Math.min(100, stats.cpuTempC) : 0}%` }} /></div>
            <div className="metric-desc">
              {stats?.cpuTempC != null ? t('systemMonitor.tempDesc') : t('systemMonitor.tempUnavailable')}
            </div>
          </div>
        </div>
      </div>

      <div className="tools-info">
        <h3>{t('systemMonitor.aboutTitle')}</h3>
        <ul>
          <li>{t('systemMonitor.about1')}</li>
          <li>{t('systemMonitor.about2')}</li>
          <li>{t('systemMonitor.about3')}</li>
        </ul>
      </div>
    </div>
  );
}
