import { Availability } from '../api/types';

// Badge de l'affiche (accueil et recherche) : texte court (240 px de large), couleur de la maquette. Rien pour un titre jamais demandé.
var BADGES: { [a: string]: { text: string; cls: string } } = {
  available: { text: 'Disponible', cls: 'ok' },
  partial: { text: 'Partiel', cls: 'ok' },
  processing: { text: 'Demandé', cls: 'dem' },
  pending: { text: 'En attente', cls: 'att' }
};
export function badgeFor(a: Availability): { text: string; cls: string } | null { return BADGES[a] || null; }
