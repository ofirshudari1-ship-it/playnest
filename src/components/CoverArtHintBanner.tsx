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
// Cover art fetching (electron/steamgriddb.cjs fetchCoverForItem) silently
// no-ops without a personal SteamGridDB key (DEFAULT_STEAMGRID_API_KEY is
// intentionally empty — no shared key ships with the app). That's correct
// behavior, but it used to leave the user staring at letter-tile placeholders
// with zero explanation. This banner is the explanation, shown once until
// dismissed or until a key is actually saved.
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
