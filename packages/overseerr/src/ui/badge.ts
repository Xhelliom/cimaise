import { Availability, Title } from '../api/types';

// Badge de l'affiche (accueil et recherche) : texte court (240 px de large), couleur de la maquette. Rien pour un titre jamais demandé.
var BADGES: { [a: string]: { text: string; cls: string } } = {
  available: { text: 'Disponible', cls: 'ok' },
  partial: { text: 'Partiel', cls: 'ok' },
  processing: { text: 'Demandé', cls: 'dem' },
  pending: { text: 'En attente', cls: 'att' }
};
export function badgeFor(a: Availability): { text: string; cls: string } | null { return BADGES[a] || null; }

// Disponibilités apprises par une demande faite depuis la fiche, par type + id TMDB : un même titre peut être un autre objet
// dans l'autre rangée ou la recherche. Lues au rendu de chaque tuile : le badge change sans recharger aucune page.
var known: { [k: string]: Availability } = {};
export function rememberAvailability(t: Title, a: Availability): void { known[t.mediaType + t.id] = a; t.availability = a; }
export function currentAvailability(t: Title): Availability { return known[t.mediaType + t.id] || t.availability; }
