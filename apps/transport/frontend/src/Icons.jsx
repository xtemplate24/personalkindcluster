// Small inline SVG icons (no icon library needed). They inherit text colour.
const Svg = ({ children, size = 18, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

export const StarIcon = ({ filled, ...p }) => (
  <Svg {...p}>
    <path
      d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"
      fill={filled ? "currentColor" : "none"}
    />
  </Svg>
);

// Push-pin (the map-pin shape is already used by "Near me").
export const PinIcon = (p) => (
  <Svg {...p}>
    <path d="M12 17v5" />
    <path d="M9 10.8a2 2 0 01-1.1 1.8l-1.8.9A2 2 0 005 15.2v.8a1 1 0 001 1h12a1 1 0 001-1v-.8a2 2 0 00-1.1-1.8l-1.8-.9a2 2 0 01-1.1-1.8V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z" />
  </Svg>
);

export const SunIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </Svg>
);

export const MoonIcon = (p) => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
  </Svg>
);

export const LocateIcon = (p) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Svg>
);

export const MapIcon = (p) => (
  <Svg {...p}>
    <path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6z" />
    <path d="M9 4v14M15 6v14" />
  </Svg>
);

export const SearchIcon = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Svg>
);

export const CloseIcon = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const ChevronIcon = (p) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const WheelchairIcon = (p) => (
  <Svg size={13} {...p}>
    <circle cx="11" cy="4" r="1.6" />
    <path d="M11 7v6h5l2 5M11 10h4" />
    <path d="M8 11a5 5 0 107 6" />
  </Svg>
);
