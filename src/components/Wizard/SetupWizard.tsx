import { useEffect, useState } from 'react';
import type { Drive, Settings, Language } from '../../types';
import Logo from '../Logo';
import Icon from '../Icon';
import ConfirmDialog from '../ConfirmDialog';
import { useTranslation } from '../../i18n';

interface Props {
  settings: Settings;
  onLanguageChange: (lang: Language) => void;
  onFinished: () => void;
  onSkip: () => void;
}

type Step = 'welcome' | 'drives' | 'scanning' | 'done';

export default function SetupWizard({ settings, onLanguageChange, onFinished, onSkip }: Props) {
  const t = useTranslation();
  const [step, setStep] = useState<Step>('welcome');
  const [drives, setDrives] = useState<Drive[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deepScan, setDeepScan] = useState(true);
  const [log, setLog] = useState<string[]>([]);
  const [foundCount, setFoundCount] = useState<number | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);

  useEffect(() => {
    window.playnest.getDrives().then((list) => {
      setDrives(list);
      setSelected(new Set(list.map((d) => d.path)));
    });
  }, []);

  useEffect(() => {
    if (step !== 'scanning') return undefined;
    const unsubscribe = window.playnest.onScanProgress((msg) => {
      setLog((prev) => [...prev.slice(-40), msg.message]);
    });
    return unsubscribe;
  }, [step]);

  // A skip button is required to be visible on every screen, and Esc always
  // triggers it too — someone who just wants to look at their library shouldn't
  // be forced through a scan first.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !confirmSkip) setConfirmSkip(true);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmSkip]);

  function toggleDrive(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function startScan() {
    setStep('scanning');
    setLog([t('wizard.startingScan')]);
    const count = await window.playnest.startScan({ drives: [...selected], deepScan });
    setFoundCount(count);
    setStep('done');
  }

  return (
    <div className="wizard-shell">
      <div className="wizard-card">
        <div className="wizard-top-row">
          <div className="wizard-logo"><Logo size={40} /></div>
          <div className="wizard-lang-toggle">
            <button
              className={`lang-pill ${settings.language === 'en' ? 'active' : ''}`}
              onClick={() => onLanguageChange('en')}
            >
              EN
            </button>
            <button
              className={`lang-pill ${settings.language === 'he' ? 'active' : ''}`}
              onClick={() => onLanguageChange('he')}
            >
              עברית
            </button>
          </div>
        </div>

        {step === 'welcome' && (
          <>
            <h1>{t('wizard.welcomeTitle')}</h1>
            <p className="sub">{t('wizard.welcomeBody')}</p>
            <div className="wizard-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmSkip(true)}>{t('common.skip')}</button>
              <button className="btn btn-primary" onClick={() => setStep('drives')}>
                {t('wizard.getStarted')}
              </button>
            </div>
          </>
        )}

        {step === 'drives' && (
          <>
            <h1>{t('wizard.drivesTitle')}</h1>
            <p className="sub">{t('wizard.drivesBody')}</p>

            <div className="drive-list">
              {drives.map((drive) => (
                <label key={drive.path} className={`drive-row ${selected.has(drive.path) ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(drive.path)}
                    onChange={() => toggleDrive(drive.path)}
                  />
                  <span className="drive-letter">{drive.letter}:</span>
                  <span>{t('wizard.localDisk')}</span>
                  {drive.totalGb != null && (
                    <span className="drive-space">
                      {t('wizard.freeOf', { free: drive.freeGb ?? 0, total: drive.totalGb })}
                    </span>
                  )}
                </label>
              ))}
            </div>

            <div className="toggle-row">
              <div>
                <div>{t('wizard.deepScanLabel')}</div>
                <div className="desc">{t('wizard.deepScanDesc')}</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={deepScan} onChange={(e) => setDeepScan(e.target.checked)} />
                <span className="slider" />
              </label>
            </div>

            <div className="wizard-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmSkip(true)}>{t('common.skip')}</button>
              <button className="btn btn-secondary" onClick={() => setStep('welcome')}>{t('common.back')}</button>
              <button className="btn btn-primary" onClick={startScan}>{t('wizard.startScan')}</button>
            </div>
          </>
        )}

        {step === 'scanning' && (
          <>
            <h1>{t('wizard.scanningTitle')}</h1>
            <p className="sub">{t('wizard.scanningBody')}</p>
            <div className="progress-bar-track"><div className="progress-bar-fill" /></div>
            <div className="progress-log">
              {log.map((line, i) => <div key={i}>{line}</div>)}
            </div>
            <div className="wizard-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmSkip(true)}>{t('common.skip')}</button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <h1>{t('wizard.doneTitle')}</h1>
            <p className="sub">{t('wizard.doneBody', { count: foundCount ?? 0 })}</p>
            <div className="wizard-tip">
              <Icon name="recommend" size={16} />
              <span>{t('wizard.doneTip')}</span>
            </div>
            <div className="wizard-footer">
              <button className="btn btn-primary" onClick={onFinished}>{t('wizard.enterLibrary')}</button>
            </div>
          </>
        )}
      </div>

      {confirmSkip && (
        <ConfirmDialog
          title={t('wizard.skipConfirmTitle')}
          message={t('wizard.skipConfirmBody')}
          confirmLabel={t('wizard.skipAnyway')}
          onConfirm={onSkip}
          onCancel={() => setConfirmSkip(false)}
        />
      )}
    </div>
  );
}
