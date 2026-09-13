export function LogoMark({ size = 28, tile = false, className = '' }) {
  if (tile) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" className={`logo ${className}`} aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#0BB57A" />
        <path d="M32 9c-9.94 0-18 8.06-18 18 0 13.5 18 30 18 30s18-16.5 18-30c0-9.94-8.06-18-18-18z" fill="#FFFFFF" />
        <rect x="26.5" y="18" width="11" height="17" rx="3.5" fill="#0BB57A" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 40 48" className={`logo ${className}`} aria-hidden="true">
      <path d="M20 1C9.5 1 1 9.5 1 20c0 14.2 19 27 19 27s19-12.8 19-27C39 9.5 30.5 1 20 1z" fill="#0BB57A" />
      <rect x="14.2" y="10.5" width="11.6" height="18" rx="3.8" fill="#FFFFFF" />
    </svg>
  );
}

export function Wordmark({ size = 18, className = '' }) {
  return (
    <span className={`wordmark ${className}`} style={{ fontSize: size }}>
      SpotOn
    </span>
  );
}
