const STROKE = {
  back: <path d="M15 18l-6-6 6-6" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  fit: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  locate: (
    <>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  bolt: <path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12z" strokeLinejoin="round" />,
  accessible: (
    <>
      <circle cx="12" cy="4.5" r="1.6" />
      <path d="M10.5 8v6.5H16l2.5 5" />
      <path d="M10.5 10.5h5" />
      <path d="M8.2 11.4a5 5 0 1 0 6.7 6.6" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" strokeLinejoin="round" />
    </>
  ),
  car: (
    <>
      <path d="M5.5 12l1.6-4.4A2 2 0 0 1 9 6.3h6a2 2 0 0 1 1.9 1.3L18.5 12" />
      <rect x="3.5" y="12" width="17" height="6" rx="2" />
      <path d="M6.5 18v2M17.5 18v2M7.5 15h.01M16.5 15h.01" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  navigate: <path d="M3.5 11L21 3l-8 17.5-2.3-7.2z" strokeLinejoin="round" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4" r="1.6" />
      <path d="M10 21l2-6-2.5-2 1-5.5 3 1.5 2 3.5 2.5 1M9.5 13.5L7 17l-2 4M13 15l2.5 6" />
    </>
  ),
  lift: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M9 14l-2.5-3L4 14M15 10l2.5 3 2.5-3" transform="translate(2.5 0) scale(0.9) translate(0 1)" />
    </>
  ),
  trendUp: <path d="M5 16l5-5 4 4 5-6M15 9h4v4" />,
  trendDown: <path d="M5 8l5 5 4-4 5 6M15 15h4v-4" />,
  trendFlat: <path d="M4 12h13M14 8l4 4-4 4" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 13v6H5V6h6" />,
  refresh: <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />,
  map: (
    <>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" strokeLinejoin="round" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 14.5h4" />
    </>
  ),
  cash: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6.5 10v4M17.5 10v4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5l9 16h-18z" strokeLinejoin="round" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 4v4.5H8M12 8v4.5l3 2" />
    </>
  ),
  entrance: <path d="M4 12h12M11 7l5 5-5 5M20 4v16" />,
  ticket: (
    <>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5a1.5 1.5 0 0 0 0 3V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.5a1.5 1.5 0 0 0 0-3z" strokeLinejoin="round" />
      <path d="M14 6v12" strokeDasharray="2 2" />
    </>
  ),
  mall: (
    <>
      <path d="M5.5 8.5h13l-1 11.5h-11z" strokeLinejoin="round" />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
    </>
  ),
  hospital: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  metro: (
    <>
      <rect x="4.5" y="3.5" width="15" height="13.5" rx="3.5" />
      <path d="M4.5 10.5h15M8.5 17l-2 3.5M15.5 17l2 3.5M8.5 14h.01M15.5 14h.01" />
    </>
  ),
  rail: (
    <>
      <path d="M7 3.5h10a3 3 0 0 1 3 3V14a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V6.5a3 3 0 0 1 3-3z" strokeLinejoin="round" />
      <path d="M4 11h16M9 18l-1.5 3M15 18l1.5 3M12 6.5V11" />
    </>
  ),
  stadium: <path d="M5.5 21V4M5.5 4.5h11.5l-2.5 4.25L17 13H5.5" strokeLinejoin="round" />,
  public: (
    <>
      <path d="M12 21s-7-6.3-7-11.5a7 7 0 0 1 14 0C19 14.7 12 21 12 21z" strokeLinejoin="round" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
};

const FILL = {
  airport: <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />,
};

export function Icon({ name, size = 20, className = '', label, ...rest }) {
  const fill = FILL[name];
  const body = fill || STROKE[name] || STROKE.info;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`icon ${className}`}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={fill ? 0 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {label ? <title>{label}</title> : null}
      {body}
    </svg>
  );
}

export const TYPE_ICON = {
  mall: 'mall',
  hospital: 'hospital',
  metro: 'metro',
  rail: 'rail',
  stadium: 'stadium',
  airport: 'airport',
  public: 'public',
};
