// The Playnest mark: a "nest" of arcs cradling a play triangle. Rendered inline
// as SVG (not a raster image) so it stays crisp at any size and can pick up the
// app's own gradient tokens. Kept visually in sync with build/logo.svg (the
// source used to generate the app icon and installer graphics).

export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
        <linearGradient id="logoSheen" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#logoBg)" />
      <rect x="2" y="2" width="60" height="28" rx="16" fill="url(#logoSheen)" />
      <rect x="2" y="2" width="60" height="60" rx="16" fill="none" stroke="#ffffff" strokeOpacity="0.16" />
      <g stroke="#ffffff" strokeWidth="2.3" strokeLinecap="round" fill="none" opacity="0.95">
        <path d="M11.5 41.5 Q32 51 52.5 41.5" />
        <path d="M15 37 Q32 45.5 49 37" opacity="0.72" />
      </g>
      <path d="M26.5 19.6q0-1 .9-.5l13.2 8.3q.9.5 0 1.1L27.4 36.9q-.9.5-.9-.5Z" fill="#ffffff" />
    </svg>
  );
}
