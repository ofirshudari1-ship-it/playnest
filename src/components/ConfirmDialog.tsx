import { useTranslation } from '../i18n';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  const t = useTranslation();
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-body" style={{ padding: 26 }}>
          <h2 style={{ marginTop: 0 }}>{title}</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.5 }}>{message}</p>
          <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={onCancel}>{t('common.cancel')}</button>
            <button className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>
              {confirmLabel || t('common.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
