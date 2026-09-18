import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';

interface Streak {
  currentStreak: number;
  longestStreak: number;
  totalActiveDays: number;
}

export default function StreakTracker() {
  const t = useTranslation();
  const [streak, setStreak] = useState<Streak | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.playnest.getStreak().then((s) => {
      setStreak(s);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="streak-tracker">
        <h2>{t('streakTracker.title')}</h2>
        <p className="subtitle">{t('streakTracker.loadingSubtitle')}</p>
      </div>
    );
  }

  const current = streak?.currentStreak || 0;
  const longest = streak?.longestStreak || 0;
  const totalDays = streak?.totalActiveDays || 0;

  return (
    <div className="streak-tracker">
      <h2>{t('streakTracker.title')}</h2>
      <p className="subtitle">{t('streakTracker.subtitle')}</p>

      <div className="streak-cards">
        <div className="streak-card main">
          <div className="streak-value">{current}</div>
          <div className="streak-label">
            {current === 1 ? t('streakTracker.dayLabel') : t('streakTracker.daysLabel')} {t('streakTracker.inARow')}
          </div>
        </div>
        <div className="streak-card">
          <div className="streak-value">{longest}</div>
          <div className="streak-label">{t('streakTracker.longestStreak')}</div>
        </div>
        <div className="streak-card">
          <div className="streak-value">{totalDays}</div>
          <div className="streak-label">{t('streakTracker.totalActiveDays')}</div>
        </div>
      </div>

      {current === 0 && (
        <div className="rec-card">{t('streakTracker.noStreakYet')}</div>
      )}
      {current > 0 && current === longest && current >= 3 && (
        <div className="rec-card">{t('streakTracker.longestEver')}</div>
      )}

      <div className="tools-info" style={{ marginTop: 24 }}>
        <h3>{t('streakTracker.howThisWorksTitle')}</h3>
        <ul>
          <li>{t('streakTracker.howThisWorks1')}</li>
          <li>{t('streakTracker.howThisWorks2')}</li>
          <li>{t('streakTracker.howThisWorks3')}</li>
        </ul>
      </div>
    </div>
  );
}
