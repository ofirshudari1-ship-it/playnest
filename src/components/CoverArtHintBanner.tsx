import type { LibraryItem, Settings } from '../types';
import Icon from './Icon';
import { useTranslation } from '../i18n';

interface Props {
  library: LibraryItem[];
  settings: Settings;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

// Pure predicate, exported so it can be unit-tested without mounting React
// (see tests/cover-art-banner.test.cjs — that file re-implements this same
// check against a couple of fixtures to guard the show/hide contract).
//
// Cover art fetching (electron/steamgriddb.cjs fetchCoverForItem) now works
// out of the box via the shared DEFAULT_STEAMGRID_API_KEY (electron/config.cjs)
// - most items should get art automatically. This banner still has a real
// purpose: a shared key can be rate-limited or miss obscure titles, and a
// personal key (entered here) always takes priority and gives the user
// their own quota. Shown while any item still lacks art, until dismissed
// or until a personal key is saved.
export function shouldShowCoverArtBanner(settings: Settings, library: LibraryItem[]): boolean {
  if (settings.coverArtBannerDismissed) return false;
  if (settings.steamGridApiKey && settings.steamGridApiKey.trim()) return false;
  return library.some((item) => !item.coverArt);
}

export default function CoverArtHintBanner({ library, settings, onOpenSettings, onDismiss }: Props) {
  const t = useTranslation();
  if (!shouldShowCoverArtBanner(settings, library)) return null;

  return (
    <div className="cover-art-hint-banner">
      <Icon name="insights" size={18} />
      <span>{t('coverArtBanner.text')}</span>
      <div className="cover-art-hint-actions">
        <button className="btn btn-primary" onClick={onOpenSettings}>{t('coverArtBanner.action')}</button>
        <button className="btn-link" onClick={onDismiss}>{t('coverArtBanner.dismiss')}</button>
      </div>
    </div>
  );
}
