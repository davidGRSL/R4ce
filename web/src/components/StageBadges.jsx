import { Flame, Users, Star } from 'lucide-react';
import { stageBadges } from '../lib/social.js';

const BADGE_UI = {
  popular:      { icon: Flame, label: 'Popular',        cls: 'border-rally text-rally' },
  crowded:      { icon: Users, label: 'Concurrido',     cls: 'border-signal text-signal' },
  communityFav: { icon: Star,  label: 'Fav. comunidad', cls: 'border-forest text-forest' },
};

/**
 * Chips de recompensa social de un tramo. No renderiza nada si el
 * tramo aún no ha ganado ningún badge.
 */
export default function StageBadges({ stage, size = 11 }) {
  const badges = stageBadges(stage);
  if (badges.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {badges.map((b) => {
        const { icon: Icon, label, cls } = BADGE_UI[b];
        return (
          <span
            key={b}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 border text-[10px] font-mono uppercase tracking-widest ${cls}`}
          >
            <Icon size={size} /> {label}
          </span>
        );
      })}
    </span>
  );
}
