import { Availability, Title } from './types';

// mediaInfo.status → disponibilité. 1 (inconnu) et tout code non listé (version future) valent « jamais demandé » :
// le badge n'affirme rien qu'Overseerr n'ait dit.
export function availability(mediaInfo: any): Availability {
  switch (mediaInfo && mediaInfo.status) {
    case 2: return 'pending';
    case 3: return 'processing';
    case 4: return 'partial';
    case 5: return 'available';
    default: return 'none';
  }
}

// Texte du badge ; null : pas de badge (titre demandable).
export function availabilityLabel(a: Availability): string | null {
  switch (a) {
    case 'available': return 'Disponible';
    case 'partial': return 'Partiellement disponible';
    case 'processing': return 'Demandé';
    case 'pending': return 'En attente';
    default: return null;
  }
}

// Affiche TMDB en taille réduite, jamais l'original (w185 ≈ 10 Ko, w300 ≈ 22 Ko, original ≈ 570 Ko mesurés le 30/10).
export var TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';
export function posterUrl(posterPath: string | null, size: 'w185' | 'w300', base?: string): string | null {
  if (!posterPath) return null;
  return (base || TMDB_IMAGE_BASE) + (size === 'w300' ? 'w300' : 'w185') + posterPath;
}

function year(date: any): number | null {
  var m = typeof date === 'string' ? /^(\d{4})/.exec(date) : null;
  return m ? Number(m[1]) : null;
}

// Résultat brut (MovieResult ou TvResult) → Title ; null pour une personne ou un résultat illisible.
export function toTitle(r: any): Title | null {
  if (!r || typeof r.id !== 'number' || (r.mediaType !== 'movie' && r.mediaType !== 'tv')) return null;
  var movie = r.mediaType === 'movie';
  return {
    id: r.id,
    mediaType: r.mediaType,
    title: String((movie ? r.title : r.name) || ''),
    year: year(movie ? r.releaseDate : r.firstAirDate),
    posterPath: typeof r.posterPath === 'string' && r.posterPath ? r.posterPath : null,
    overview: typeof r.overview === 'string' ? r.overview : '',
    availability: availability(r.mediaInfo)
  };
}

// Ajoute à list les titres de add absents (même type et même id), dans l'ordre ; list est modifiée et renvoyée.
// TMDB répète des titres d'une page à la suivante : sans cela, la grille afficherait des doublons.
export function appendTitles(list: Title[], add: Title[]): Title[] {
  var seen: { [k: string]: boolean } = {};
  for (var i = 0; i < list.length; i++) seen[list[i].mediaType + list[i].id] = true;
  for (var j = 0; j < add.length; j++) {
    var k = add[j].mediaType + add[j].id;
    if (!seen[k]) { seen[k] = true; list.push(add[j]); }
  }
  return list;
}
