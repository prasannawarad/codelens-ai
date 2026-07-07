// The lens mark: an aperture ring with crosshair ticks.
export function LensMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="var(--color-volt-400)" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill="var(--color-volt-400)" />
      <path
        d="M12 0.8v3.4M12 19.8v3.4M0.8 12h3.4M19.8 12h3.4"
        stroke="var(--color-volt-400)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Brand({ size = 'md' }) {
  const text = size === 'lg' ? 'text-2xl' : 'text-[15px]';
  return (
    <span className="inline-flex items-center gap-2.5">
      <LensMark size={size === 'lg' ? 28 : 20} />
      <span
        className={`font-display font-semibold tracking-tight text-snow ${text}`}
        style={{ fontOpticalSizing: 'auto' }}
      >
        CodeLens
      </span>
    </span>
  );
}
