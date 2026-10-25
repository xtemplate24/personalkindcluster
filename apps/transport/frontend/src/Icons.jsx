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

export const BusIcon = (p) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="15" rx="3" />
    <path d="M4 11h16M8 18v2.5M16 18v2.5" />
    <circle cx="8" cy="14.5" r="0.6" fill="currentColor" />
    <circle cx="16" cy="14.5" r="0.6" fill="currentColor" />
  </Svg>
);

export const TrainIcon = (p) => (
  <Svg {...p}>
    <rect x="5" y="3" width="14" height="14" rx="4" />
    <path d="M5 10h14M8.5 21l2-4M15.5 21l-2-4" />
    <circle cx="9" cy="13.5" r="0.6" fill="currentColor" />
    <circle cx="15" cy="13.5" r="0.6" fill="currentColor" />
  </Svg>
);

export const StarIcon = ({ filled, ...p }) => (
  <Svg {...p}>
    <path
      d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"
      fill={filled ? "currentColor" : "none"}
    />
  </Svg>
);

export const TargetIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
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

export const AlertIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3.5L2.5 20h19z" />
    <path d="M12 10v4.5M12 17.2v.3" />
  </Svg>
);

export const WheelchairIcon = (p) => (
  <Svg size={13} {...p}>
    <circle cx="11" cy="4" r="1.6" />
    <path d="M11 7v6h5l2 5M11 10h4" />
    <path d="M8 11a5 5 0 107 6" />
  </Svg>
);
