// A small hand-authored line-icon set, styled consistently (20x20, stroke-based,
// currentColor) instead of emoji glyphs — emoji render differently per OS/font and
// read as a chat app, not a desktop application chrome.

export type IconName =
  | 'everything' | 'games' | 'applications' | 'favorites' | 'system' | 'hidden'
  | 'tag' | 'plus' | 'performance' | 'streak' | 'monitor' | 'analytics'
  | 'recommend' | 'insights' | 'storage' | 'hardware' | 'settings'
  | 'dice' | 'checklist' | 'refresh' | 'search' | 'close' | 'language';

const PATHS: Record<IconName, JSX.Element> = {
  everything: (
    <>
      <rect x="3" y="3" width="6.5" height="6.5" rx="1.4" />
      <rect x="10.5" y="3" width="6.5" height="6.5" rx="1.4" />
      <rect x="3" y="10.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="10.5" y="10.5" width="6.5" height="6.5" rx="1.4" />
    </>
  ),
  games: (
    <>
      <path d="M6 8h.01M4 10h4M6 8v4" />
      <circle cx="14" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <path d="M6.5 6h7a4 4 0 0 1 4 4v2.4a2.6 2.6 0 0 1-4.6 1.65L12 13H8l-.9 1.05A2.6 2.6 0 0 1 2.5 12.4V10a4 4 0 0 1 4-4z" />
    </>
  ),
  applications: (
    <>
      <rect x="3" y="3.5" width="14" height="13" rx="2" />
      <path d="M3 7.2h14" />
      <circle cx="5.4" cy="5.35" r="0.55" fill="currentColor" stroke="none" />
    </>
  ),
  favorites: <path d="M10 2.6 12.3 7.4 17.6 8.2 13.8 11.9 14.7 17.2 10 14.6 5.3 17.2 6.2 11.9 2.4 8.2 7.7 7.4Z" />,
  system: (
    <>
      <rect x="6" y="6" width="8" height="8" rx="1" />
      <rect x="8.4" y="8.4" width="3.2" height="3.2" rx="0.5" />
      <path d="M10 2.5v2.3M10 15.2v2.3M2.5 10h2.3M15.2 10h2.3M4.6 4.6l1.6 1.6M13.8 13.8l1.6 1.6M4.6 15.4l1.6-1.6M13.8 6.2l1.6-1.6" />
    </>
  ),
  hidden: (
    <>
      <path d="M2.5 10.5S5.5 5 10 5s7.5 5.5 7.5 5.5-3 5.5-7.5 5.5S2.5 10.5 2.5 10.5Z" opacity="0.35" />
      <path d="M3 3l14 14" />
      <path d="M8.2 8.3a2.4 2.4 0 0 0 3.5 3.3" />
      <path d="M12.6 6.8c1.8.9 3 2.2 3.6 3-1.1 1.6-3.6 4.5-6.2 4.5-.7 0-1.4-.1-2-.4M5.8 6.3C4.2 7.1 3 8.6 2.5 9.5" />
    </>
  ),
  tag: (
    <>
      <path d="M11 3H4.5A1.5 1.5 0 0 0 3 4.5V11l7.3 7.3a1.5 1.5 0 0 0 2.12 0l5.9-5.9a1.5 1.5 0 0 0 0-2.12L11 3Z" />
      <circle cx="7.4" cy="7.4" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),
  plus: <path d="M10 4v12M4 10h12" />,
  performance: (
    <>
      <path d="M10 11 13.2 7" />
      <path d="M3.2 13a7 7 0 0 1 13.6 0" />
      <path d="M3.2 13h.01M16.8 13h.01M10 4.6v.01" />
    </>
  ),
  streak: (
    <path d="M10 2.8c.4 2 2.6 3 2.6 5.6a2.6 2.6 0 0 1-5.2 0c0-.7.2-1.2.5-1.7-1.3.9-2.1 2.4-2.1 4.1a4.2 4.2 0 1 0 8.4 0c0-3.8-2.5-5.6-4.2-8Z" />
  ),
  monitor: (
    <>
      <rect x="2.5" y="4" width="15" height="10.5" rx="1.6" />
      <path d="M7 17.5h6M10 14.5v3" />
      <path d="M4.5 10.5l2.2-3 2 2.2 2.2-4 2 3.3h2.1" />
    </>
  ),
  analytics: (
    <>
      <path d="M3 17V3M3 17h14" />
      <rect x="6" y="10" width="2.4" height="5" rx="0.4" fill="currentColor" stroke="none" />
      <rect x="10.2" y="6.5" width="2.4" height="8.5" rx="0.4" fill="currentColor" stroke="none" />
      <rect x="14.4" y="8.5" width="2.4" height="6.5" rx="0.4" fill="currentColor" stroke="none" />
    </>
  ),
  recommend: (
    <>
      <path d="M10 3v2.2M10 14.8V17M3 10h2.2M14.8 10H17M5.2 5.2l1.5 1.5M13.3 13.3l1.5 1.5M5.2 14.8l1.5-1.5M13.3 6.7l1.5-1.5" opacity="0.55" />
      <circle cx="10" cy="10" r="3.1" />
    </>
  ),
  insights: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M12.6 7.4 10.8 10.8 7.4 12.6 9.2 9.2Z" fill="currentColor" stroke="none" />
    </>
  ),
  storage: (
    <>
      <rect x="2.5" y="3.5" width="15" height="7" rx="1.6" />
      <rect x="2.5" y="10.5" width="15" height="6" rx="1.6" />
      <circle cx="5.6" cy="7" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="5.6" cy="13.5" r="0.7" fill="currentColor" stroke="none" />
      <path d="M9 7h6M9 13.5h6" />
    </>
  ),
  hardware: (
    <>
      <rect x="3" y="3.5" width="14" height="9.5" rx="1.6" />
      <path d="M7.5 17h5M10 13v4" />
      <rect x="6.2" y="6.2" width="7.6" height="4" rx="0.6" />
    </>
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.6v2.1M10 15.3v2.1M17.4 10h-2.1M4.7 10H2.6M15.1 4.9l-1.5 1.5M6.4 13.6l-1.5 1.5M15.1 15.1l-1.5-1.5M6.4 6.4 4.9 4.9" />
    </>
  ),
  dice: (
    <>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2.4" />
      <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="13" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="7" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="13" cy="13" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  checklist: (
    <>
      <path d="M7.5 5h9M7.5 10h9M7.5 15h9" />
      <path d="M3 4.2l.9.9L5.4 3.3" />
      <path d="M3 9.2l.9.9L5.4 8.3" />
      <path d="M3 14.2l.9.9 1.5-1.8" />
    </>
  ),
  refresh: (
    <>
      <path d="M16.5 10a6.5 6.5 0 1 1-2-4.7" />
      <path d="M16.5 3.5v4h-4" />
    </>
  ),
  search: (
    <>
      <circle cx="8.7" cy="8.7" r="5.2" />
      <path d="M16.5 16.5 12.8 12.8" />
    </>
  ),
  close: <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />,
  language: (
    <>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M2.8 10h14.4M10 2.8c1.9 2 3 4.6 3 7.2s-1.1 5.2-3 7.2c-1.9-2-3-4.6-3-7.2s1.1-5.2 3-7.2Z" />
    </>
  )
};

export default function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="icon"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
