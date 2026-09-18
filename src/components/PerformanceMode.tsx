import { useEffect, useState } from 'react';
import { showToast } from '../toast';
import { useTranslation } from '../i18n';

type Plan = 'balanced' | 'performance' | 'saver';

export default function PerformanceMode() {
  const t = useTranslation();
  const [gameModeOn, setGameModeOn] = useState<boolean | null>(null);
  const [savingGameMode, setSavingGameMode] = useState(false);
  const [activePlan, setActivePlan] = useState<string | null>(null);
  const [switchingPlan, setSwitchingPlan] = useState<Plan | null>(null);

  const PLANS: { id: Plan; icon: string; title: string; desc: string }[] = [
    { id: 'saver', icon: '🔋', title: t('performanceMode.planSaverTitle'), desc: t('performanceMode.planSaverDesc') },
    { id: 'balanced', icon: '⚖️', title: t('performanceMode.planBalancedTitle'), desc: t('performanceMode.planBalancedDesc') },
    { id: 'performance', icon: '🚀', title: t('performanceMode.planPerformanceTitle'), desc: t('performanceMode.planPerformanceDesc') }
  ];

  useEffect(() => {
    window.playnest.getGameMode().then(setGameModeOn);
    window.playnest.getActivePowerPlan().then(setActivePlan);
  }, []);

  async function toggleGameMode() {
    if (gameModeOn === null) return;
    setSavingGameMode(true);
    const next = !gameModeOn;
    const result = await window.playnest.setGameMode(next);
    setSavingGameMode(false);
    if (result.ok) {
      setGameModeOn(next);
      showToast(next ? t('performanceMode.gameModeEnabled') : t('performanceMode.gameModeDisabled'), 'success');
    } else {
      showToast(result.error || t('performanceMode.gameModeError'), 'error');
    }
  }

  async function selectPlan(plan: Plan) {
    setSwitchingPlan(plan);
    const result = await window.playnest.setPowerPlan(plan);
    setSwitchingPlan(null);
    if (result.ok) {
      setActivePlan(await window.playnest.getActivePowerPlan());
      showToast(t('performanceMode.planSwitched', { plan: PLANS.find((p) => p.id === plan)?.title || plan }), 'success');
    } else {
      showToast(result.error || t('performanceMode.planError'), 'error');
    }
  }

  return (
    <div className="performance-mode">
      <h2>{t('performanceMode.title')}</h2>
      <p className="subtitle">{t('performanceMode.subtitle')}</p>

      <div className="mode-toggle-large">
        <div className="setting-toggle" style={{ background: 'transparent', border: 'none', padding: 0 }}>
          <div className="setting-info">
            <div className="setting-title">{t('performanceMode.gameModeTitle')}</div>
            <div className="setting-desc">
              {gameModeOn === null
                ? t('performanceMode.gameModeChecking')
                : gameModeOn
                ? t('performanceMode.gameModeOnDesc')
                : t('performanceMode.gameModeOffDesc')}
            </div>
          </div>
          <button
            className={`toggle-btn ${gameModeOn ? 'on' : 'off'}`}
            onClick={toggleGameMode}
            disabled={gameModeOn === null || savingGameMode}
          >
            {savingGameMode ? '...' : gameModeOn ? t('performanceMode.gameModeOn') : t('performanceMode.gameModeOff')}
          </button>
        </div>
      </div>

      <div className="field-label">{t('performanceMode.powerPlanLabel')}</div>
      <div className="mode-selector">
        {PLANS.map((plan) => (
          <button
            key={plan.id}
            className={`profile-btn ${activePlan === plan.id ? 'active' : ''}`}
            style={{ width: '100%', textAlign: 'left', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14 }}
            onClick={() => selectPlan(plan.id)}
            disabled={switchingPlan !== null}
          >
            <span style={{ fontSize: 22 }}>{plan.icon}</span>
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{plan.title}{activePlan === plan.id ? t('performanceMode.planActiveSuffix') : ''}</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{plan.desc}</div>
            </span>
            {switchingPlan === plan.id && <span>...</span>}
          </button>
        ))}
      </div>

      <div className="tools-info">
        <h3>{t('performanceMode.whatsHappeningTitle')}</h3>
        <ul>
          <li><strong>{t('performanceMode.gameModeTitle')}</strong> {t('performanceMode.whatsHappening1')}</li>
          <li><strong>{t('performanceMode.powerPlanLabel')}</strong> {t('performanceMode.whatsHappening2')}</li>
          <li>{t('performanceMode.whatsHappening3')}</li>
        </ul>
      </div>
    </div>
  );
}
