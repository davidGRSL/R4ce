/**
 * Señales sociales de tramos (fase 1: contadores simples + badges por umbral).
 * Los umbrales son deliberadamente bajos al principio; subirlos cuando
 * crezca la comunidad (ver docs/ROADMAP.md).
 */

export const BADGE_THRESHOLDS = {
  popular:      { field: 'likesCount',     min: 5 },   // ❤ likes
  crowded:      { field: 'pilotsCount',    min: 10 },  // pilotos con tiempo
  communityFav: { field: 'favoritesCount', min: 5 },   // guardado en favoritos
};

/** Devuelve los ids de badge que ha ganado un tramo. */
export function stageBadges(stage) {
  return Object.entries(BADGE_THRESHOLDS)
    .filter(([, { field, min }]) => (stage?.[field] ?? 0) >= min)
    .map(([id]) => id);
}
