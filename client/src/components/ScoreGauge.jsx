import { useEffect, useState } from 'react';
import { scoreBand } from '../lib/score';

// Circular SVG gauge with band coloring; the arc sweeps in on mount.
// showBand adds the band word (poor/fair/good/great) under the number.
export default function ScoreGauge({ score, label, size = 120, strokeWidth = 8, showBand = false }) {
  const band = scoreBand(score);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = score == null ? 0 : Math.min(100, Math.max(0, score));
  const [sweep, setSweep] = useState(0);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setSweep(value));
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const dash = (sweep / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-edge)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={band.hex}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            style={{ transition: 'stroke-dasharray 900ms cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-semibold text-snow"
            style={{ fontSize: size / 3.7, lineHeight: 1 }}
          >
            {score == null ? '—' : Math.round(score)}
          </span>
          {showBand && score != null && (
            <span
              className="mt-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em]"
              style={{ color: band.hex }}
            >
              {band.name}
            </span>
          )}
        </div>
      </div>
      {label && <span className="microlabel">{label}</span>}
    </div>
  );
}
