// Simple 24x24 line icons, same style as the landing page.
// Drawn with stroke="currentColor", so they take the tile's colour.

const paths = {
  browser: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M3 9h18" />
      <circle cx="6.5" cy="6.5" r="0.6" fill="currentColor" />
      <circle cx="9" cy="6.5" r="0.6" fill="currentColor" />
    </>
  ),
  cloud: <path d="M7 18h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.4 9.1 4.5 4.5 0 0 0 7 18z" />,
  tunnel: (
    <>
      <path d="M4 20V11a8 8 0 0 1 16 0v9" />
      <path d="M8 20v-8a4 4 0 0 1 8 0v8" />
      <path d="M3 20h18" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <path d="M12 15.8V12M12 12 7.5 7.6M12 12l4.5-4.4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V20h12V9.5M10 20v-5h4v5" />
    </>
  ),
  currency: (
    <>
      <path d="M4 8h14M14 4l4 4-4 4" />
      <path d="M20 16H6M10 12l-4 4 4 4" />
    </>
  ),
  bus: (
    <>
      <rect x="5" y="3" width="14" height="15" rx="3" />
      <path d="M5 11h14M8 18v2.5M16 18v2.5" />
      <circle cx="8.5" cy="14.5" r="0.9" fill="currentColor" />
      <circle cx="15.5" cy="14.5" r="0.9" fill="currentColor" />
    </>
  ),
  diagram: (
    <>
      <rect x="9" y="3" width="6" height="5" rx="1.5" />
      <rect x="3" y="16" width="6" height="5" rx="1.5" />
      <rect x="15" y="16" width="6" height="5" rx="1.5" />
      <path d="M12 8v4M6 16v-4h12v4" />
    </>
  ),
  chat: (
    <>
      <path d="M20.5 12a8 8 0 0 1-11.7 7.1L4 20l1-4.4A8 8 0 1 1 20.5 12z" />
      <circle cx="8.5" cy="12" r="0.9" fill="currentColor" />
      <circle cx="12.25" cy="12" r="0.9" fill="currentColor" />
      <circle cx="16" cy="12" r="0.9" fill="currentColor" />
    </>
  ),
  dumbbell: <path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11" />,
  notes: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  sync: (
    <>
      <path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </>
  ),
  console: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m7 10 3 2.5L7 15M12.5 15H17" />
    </>
  ),
  chart: <path d="M4 20h16M7 16v-4M12 16V7M17 16v-6" />,
  shield: (
    <>
      <path d="M12 3 5 6v5.5c0 4.3 3 7.9 7 9.5 4-1.6 7-5.2 7-9.5V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  disk: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.8" />
      <path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" />
    </>
  ),
  bucket: (
    <>
      <path d="M4 6h16l-2 14H6z" />
      <path d="M4 6c0-1.4 3.6-2.5 8-2.5S20 4.6 20 6M9 11h6" />
    </>
  ),
  server: (
    <>
      <rect x="4" y="3" width="16" height="7" rx="2" />
      <rect x="4" y="14" width="16" height="7" rx="2" />
      <circle cx="8" cy="6.5" r="0.9" fill="currentColor" />
      <circle cx="8" cy="17.5" r="0.9" fill="currentColor" />
      <path d="M12 10v4" />
    </>
  ),
  github: (
    <path d="M9 19c-4 1.3-4-2-5.5-2.5M14.5 21v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.6-1.3 5.6-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.1 2.6 5 2.9 5 2.9a4.3 4.3 0 0 0-.1 3.2 4.6 4.6 0 0 0-1.3 3.2c0 4.6 2.9 5.7 5.6 6a3 3 0 0 0-.8 2.3V21" />
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  git: (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="9" r="2.2" />
      <path d="M6 8.2v7.6M18 11.2c0 3-3 4.3-9.8 5.5" />
    </>
  ),
  build: (
    <>
      <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.6-.4-.4-2.6z" />
    </>
  ),
  box: (
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21v-6" />
      <path d="M8 3h8l-1 5 3 4H6l3-4z" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" />
    </>
  ),
  stream: <path d="M3 7h12M3 12h18M3 17h9M18 4l3 3-3 3M15 14l3 3-3 3" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
};

export default function Icon({ name, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.box}
    </svg>
  );
}
