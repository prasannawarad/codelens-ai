import { scoreBand } from '../lib/score';

// Circular SVG gauge. size in px; score 0–100 or null.
export default function ScoreGauge({ score, label, size = 120, strokeWidth = 8 }) {
  const band = scoreBand(score);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = score == null ? 0 : Math.min(100, Math.max(0, score));
  const dash = (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#27272a"
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
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          transform={`rotate(90 ${size / 2} ${size / 2})`}
          fill="#e4e4e7"
          fontSize={size / 3.6}
          fontFamily="ui-monospace, monospace"
          fontWeight="600"
        >
          {score == null ? '—' : Math.round(score)}
        </text>
      </svg>
      {label && (
        <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      )}
    </div>
  );
}
