import { Item, ServerRef } from '../api/types';
import { photoUrl } from '../api/media';

// Tailles d'affichage de la scène 1920×1080 (docs/plex-design.md) : on demande exactement cette taille au transcodeur.
export var POSTER = { w: 240, h: 360 };          // grille, rangées, saisons
export var DETAIL_POSTER = { w: 360, h: 540 };   // fiche
export var EPISODE = { w: 360, h: 203 };         // vignette 16:9

// Un épisode de « En cours » montre l'affiche de sa série (le cliché de l'épisode est en 16:9).
export function posterUrl(s: ServerRef, item: Item): string | null {
  var path = item.type === 'episode' && item.grandparentThumb ? item.grandparentThumb : item.thumb;
  return path ? photoUrl(s, path, POSTER.w, POSTER.h) : null;
}
export function detailPosterUrl(s: ServerRef, item: Item): string | null {
  return item.thumb ? photoUrl(s, item.thumb, DETAIL_POSTER.w, DETAIL_POSTER.h) : null;
}
// Fond de fiche : art de l'œuvre flouté et assombri PAR LE TRANSCODEUR (≈ 4 Ko), affiché en 1920×1080 ; aucun flou CSS.
export var BACKDROP = { w: 480, h: 270 };
export function backdropUrl(s: ServerRef, item: Item): string | null {
  return item.art ? photoUrl(s, item.art, BACKDROP.w, BACKDROP.h, [['blur', 20], ['opacity', 35], ['background', '0b0b0d']]) : null;
}
export function episodeThumbUrl(s: ServerRef, item: Item): string | null {
  return item.thumb ? photoUrl(s, item.thumb, EPISODE.w, EPISODE.h) : null;
}

// Recherche : rangées étroites à droite du clavier.
export var SEARCH_POSTER = { w: 104, h: 156 };
export function searchPosterUrl(s: ServerRef, item: Item): string | null {
  var path = item.type === 'episode' && item.grandparentThumb ? item.grandparentThumb : item.thumb;
  return path ? photoUrl(s, path, SEARCH_POSTER.w, SEARCH_POSTER.h) : null;
}
