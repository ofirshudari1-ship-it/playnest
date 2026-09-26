import type { CompletionStatus, GroupBy, LibraryItem, Settings } from './types';
import { t } from './i18n';

// Single source of truth for the 5 Playnite-style completion statuses — used
// by the status selector (DetailModal), the status filter (FilterMenu), the
// card badge (GameCard) and "group by status" (groupItems below) so they can
// never drift out of sync with each other.
export const COMPLETION_STATUSES: CompletionStatus[] = ['playing', 'completed', 'on_hold', 'plan_to_play', 'dropped'];

export const STATUS_LABEL_KEYS: Record<CompletionStatus, string> = {
  playing: 'status.playing',
  completed: 'status.completed',
  on_hold: 'status.onHold',
  plan_to_play: 'status.planToPlay',
  dropped: 'status.dropped'
};

// Single glyph per status for the compact card badge — mirrors how fav-badge/
// new-badge/source-badge on GameCard are all single-glyph corner chips rather
// than full text labels (there isn't room for text at card size).
export const STATUS_ICON: Record<CompletionStatus, string> = {
  playing: '▶',
  completed: '✓',
  on_hold: '⏸',
  plan_to_play: '☰',
  dropped: '✕'
};

export function statusLabel(status: CompletionStatus | undefined): string {
  return status ? t(STATUS_LABEL_KEYS[status]) : t('status.notPlayed');
}

export function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return t('common.unknown');
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} MB`;
}

export function formatPlaytime(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) return t('helpers.neverPlayed');
  if (minutes < 60) return t('helpers.minutesPlayed', { minutes });
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0
    ? t('helpers.hoursMinutesPlayed', { hours, minutes: rem })
    : t('helpers.hoursPlayed', { hours });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return t('helpers.never');
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return t('helpers.justNow');
  if (minutes < 60) return t('helpers.minAgo', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t(hours === 1 ? 'helpers.hourAgo' : 'helpers.hoursAgo', { count: hours });
  const days = Math.round(hours / 24);
  return t(days === 1 ? 'helpers.dayAgo' : 'helpers.daysAgo', { count: days });
}

const NEW_BADGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Whether an item was added to the library recently enough to still deserve
// a "NEW" badge on its card — mirrors the "recently added" idea GOG Galaxy/
// Playnite both surface, using the addedAt timestamp scanner.cjs already
// stamps on every fresh find (see electron/main.cjs mergeScanResults).
export function isRecentlyAdded(addedAt: string | undefined): boolean {
  if (!addedAt) return false;
  const addedMs = new Date(addedAt).getTime();
  if (Number.isNaN(addedMs)) return false;
  return Date.now() - addedMs < NEW_BADGE_WINDOW_MS;
}

// Steam/Epic Games/GOG are third-party product names, not UI copy — left as-is
// regardless of language, same as "Playnest" itself. "Installed"/"Detected"
// are real UI labels and go through t().
export function sourceLabel(source: LibraryItem['source']): string {
  switch (source) {
    case 'steam': return 'Steam';
    case 'epic': return 'Epic Games';
    case 'gog': return 'GOG';
    case 'registry': return t('helpers.sourceInstalled');
    case 'folder': return t('helpers.sourceDetected');
    default: return source;
  }
}

// Local, offline "smart match" — items in the library sharing a genre tag,
// ranked by how many attributes overlap. No network calls, no cloud AI.
export function similarItems(target: LibraryItem, all: LibraryItem[], limit = 6): LibraryItem[] {
  if (!target.genre) return [];
  return all
    .filter((item) => item.id !== target.id && item.genre === target.genre)
    .slice(0, limit);
}

export interface ItemGroup {
  label: string;
  items: LibraryItem[];
}

// Internal, language-independent bucket IDs — never shown to the user directly.
// Grouping/sorting happens on these fixed IDs; the display label is resolved
// through t() only once, at the very end (sizeBucketLabel/groupLabel below), so
// switching language never has to re-key a Map mid-sort and a bucket's identity
// never depends on which language happened to be active when it was computed.
const SIZE_UNKNOWN = '__unknown_size__';
const YEAR_UNKNOWN = '__unknown_year__';
const GENRE_OTHER_GAMES = '__other_games__';
const GENRE_UNCATEGORIZED = '__uncategorized__';

function sizeBucket(bytes: number | null): string {
  if (!bytes || bytes <= 0) return SIZE_UNKNOWN;
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb < 1) return 'under1';
  if (gb < 5) return '1to5';
  if (gb < 20) return '5to20';
  if (gb < 50) return '20to50';
  return '50plus';
}
const SIZE_BUCKET_ORDER = ['50plus', '20to50', '5to20', '1to5', 'under1', SIZE_UNKNOWN];

const SIZE_BUCKET_LABEL_KEYS: Record<string, string> = {
  '50plus': 'helpers.sizeBucket50Plus',
  '20to50': 'helpers.sizeBucket20to50',
  '5to20': 'helpers.sizeBucket5to20',
  '1to5': 'helpers.sizeBucket1to5',
  under1: 'helpers.sizeBucketUnder1',
  [SIZE_UNKNOWN]: 'helpers.sizeBucketUnknown'
};

function groupLabel(groupBy: GroupBy, key: string): string {
  if (groupBy === 'size') return t(SIZE_BUCKET_LABEL_KEYS[key] || key);
  if (groupBy === 'year') return key === YEAR_UNKNOWN ? t('helpers.unknownYear') : key;
  if (groupBy === 'status') return key; // already a translated statusLabel() string — see below
  if (key === GENRE_OTHER_GAMES) return t('helpers.otherGames');
  if (key === GENRE_UNCATEGORIZED) return t('helpers.uncategorized');
  return key; // a real genre name (e.g. "RPG") — not app UI copy, left as-is
}

// Only called when the user has explicitly picked a "group by" — the default library
// view stays one flat, sortable grid.
export function groupItems(items: LibraryItem[], groupBy: GroupBy): ItemGroup[] {
  const buckets = new Map<string, LibraryItem[]>();
  for (const item of items) {
    let key: string;
    if (groupBy === 'size') key = sizeBucket(item.sizeBytes);
    else if (groupBy === 'year') key = item.releaseYear ? String(item.releaseYear) : YEAR_UNKNOWN;
    else if (groupBy === 'status') key = statusLabel(item.completionStatus);
    else key = item.genre || (item.category === 'game' ? GENRE_OTHER_GAMES : GENRE_UNCATEGORIZED);

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }

  let orderedKeys: string[];
  if (groupBy === 'size') {
    orderedKeys = SIZE_BUCKET_ORDER.filter((k) => buckets.has(k));
  } else if (groupBy === 'status') {
    // "Playing" first (what you're actively in the middle of), "Not played" last
    // (the backlog you haven't touched at all) — mirrors Playnite's default
    // status ordering rather than sorting alphabetically.
    const order = [...COMPLETION_STATUSES.map(statusLabel), t('status.notPlayed')];
    orderedKeys = order.filter((k) => buckets.has(k));
  } else if (groupBy === 'year') {
    orderedKeys = [...buckets.keys()].sort((a, b) => {
      if (a === YEAR_UNKNOWN) return 1;
      if (b === YEAR_UNKNOWN) return -1;
      return Number(b) - Number(a);
    });
  } else {
    orderedKeys = [...buckets.keys()].sort((a, b) => {
      if (a === GENRE_OTHER_GAMES || a === GENRE_UNCATEGORIZED) return 1;
      if (b === GENRE_OTHER_GAMES || b === GENRE_UNCATEGORIZED) return -1;
      return a.localeCompare(b);
    });
  }

  return orderedKeys.map((key) => ({ label: groupLabel(groupBy, key), items: buckets.get(key)! }));
}

export function sortItems(items: LibraryItem[], sortBy: Settings['sortBy']): LibraryItem[] {
  const copy = [...items];
  switch (sortBy) {
    case 'size':
      return copy.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
    case 'recent':
      return copy.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    // 'playtime' and 'lastPlayed' existed in the type but had no case here, so picking
    // either from the sort dropdown silently fell through to name sort. GOG Galaxy and
    // Playnite both treat "last played" as a first-class library sort — items that were
    // never played sink to the bottom (empty timestamp sorts last) rather than the top.
    case 'playtime':
      return copy.sort((a, b) => (b.totalPlaytimeMinutes || 0) - (a.totalPlaytimeMinutes || 0));
    case 'lastPlayed':
      return copy.sort((a, b) => (b.lastPlayedAt || '').localeCompare(a.lastPlayedAt || ''));
    default:
      return copy.sort((a, b) => a.name.localeCompare(b.name));
  }
}

// Local, offline heuristic — no network calls, no cloud AI. Surfaces library entries
// that likely need the user's attention: shortcuts whose target no longer exists on
// disk (moved/uninstalled outside Playnest) and favorites that have never actually
// been launched. `staleIds` comes from the existing library:verify IPC check (already
// run manually from Settings); this just also runs it proactively after every load.
export interface NeedsAttentionItem {
  item: LibraryItem;
  reason: 'broken' | 'unplayedFavorite';
}

export function computeNeedsAttention(library: LibraryItem[], staleIds: Set<string>): NeedsAttentionItem[] {
  const broken: NeedsAttentionItem[] = library
    .filter((i) => staleIds.has(i.id))
    .map((item) => ({ item, reason: 'broken' as const }));

  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const unplayedFavorites: NeedsAttentionItem[] = library
    .filter((i) => !staleIds.has(i.id) && i.isFavorite && !i.totalPlaytimeMinutes && i.addedAt && new Date(i.addedAt).getTime() < twoWeeksAgo)
    .map((item) => ({ item, reason: 'unplayedFavorite' as const }));

  return [...broken, ...unplayedFavorites];
}

export function performanceVerdict(
  itemGenre: string | null,
  hardwareTier: 'Entry-Level' | 'Mid-Range' | 'High-End' | 'Enthusiast' | 'Unknown'
): { label: string; tone: 'good' | 'ok' | 'bad' } {
  const demandingGenres = ['Shooter', 'RPG', 'Action / Adventure', 'Simulation'];
  const isDemanding = itemGenre ? demandingGenres.includes(itemGenre) : false;

  const tierRank: Record<string, number> = { 'Entry-Level': 1, 'Mid-Range': 2, 'High-End': 3, Enthusiast: 4, Unknown: 2 };
  const rank = tierRank[hardwareTier] ?? 2;
  const requiredRank = isDemanding ? 3 : 2;

  if (rank >= requiredRank + 1) return { label: 'Runs excellently on your PC', tone: 'good' };
  if (rank >= requiredRank) return { label: 'Runs well on your PC', tone: 'good' };
  if (rank === requiredRank - 1) return { label: 'Playable, may need lower settings', tone: 'ok' };
  return { label: 'May struggle on your current hardware', tone: 'bad' };
}
