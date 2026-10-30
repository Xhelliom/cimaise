// Sans dépendance : le panneau de réglages (chunk settings.js) l'utilise sans tirer le reste du module Plex.
export function el(doc: Document, cls: string, text?: string): HTMLElement {
  var e = doc.createElement('div');
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
