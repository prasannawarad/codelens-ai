// Score bands (§10): 0–40 red, 41–70 amber, 71–85 blue, 86–100 green.
export function scoreBand(score) {
  if (score == null) return { name: 'none', hex: '#52525b', text: 'text-zinc-500', bg: 'bg-zinc-800' };
  if (score <= 40) return { name: 'poor', hex: '#ef4444', text: 'text-red-400', bg: 'bg-red-500/15' };
  if (score <= 70) return { name: 'fair', hex: '#f59e0b', text: 'text-amber-400', bg: 'bg-amber-500/15' };
  if (score <= 85) return { name: 'good', hex: '#3b82f6', text: 'text-blue-400', bg: 'bg-blue-500/15' };
  return { name: 'great', hex: '#22c55e', text: 'text-emerald-400', bg: 'bg-emerald-500/15' };
}

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

export const SEVERITY_STYLES = {
  critical: 'text-red-400 border-red-500/40 bg-red-500/10',
  high: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
  medium: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  low: 'text-zinc-400 border-zinc-600/60 bg-zinc-700/20',
};

export function timeAgo(dateish) {
  if (!dateish) return 'never';
  const seconds = Math.floor((Date.now() - new Date(dateish).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateish).toLocaleDateString();
}
