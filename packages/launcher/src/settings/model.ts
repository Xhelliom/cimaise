// Catalogue d'apps du launcher : fonctions pures, jamais de mutation de l'entrée.
export interface AppEntry { id: string; name: string; icon?: string; tint: string; }
export interface DiscoveredApp { id: string; name: string; icon?: string; }

// Petite palette de teintes (fond de la tuile et halo du Dock v2).
export var PALETTE = ['#e5a00d', '#e50914', '#c4302b', '#113ccf', '#1f8a5b', '#8a3ffc', '#d6336c', '#5a5a5f'];

function copy(c: AppEntry[]): AppEntry[] { return c.slice(0); }

export function removeAt(c: AppEntry[], i: number): AppEntry[] {
  var r = copy(c);
  r.splice(i, 1);
  return r;
}

// Déplace l'entrée i de dir (-1 ou +1) ; sans effet aux bornes.
export function moveItem(c: AppEntry[], i: number, dir: number): AppEntry[] {
  var j = i + dir, r = copy(c);
  if (j < 0 || j >= r.length || i < 0 || i >= r.length) return r;
  var t = r[i]; r[i] = r[j]; r[j] = t;
  return r;
}

export function setTint(c: AppEntry[], i: number, tint: string): AppEntry[] {
  var r = copy(c);
  if (PALETTE.indexOf(tint) < 0 || !r[i]) return r;
  r[i] = { id: r[i].id, name: r[i].name, icon: r[i].icon, tint: tint };
  return r;
}

export function nextTint(tint: string): string {
  return PALETTE[(PALETTE.indexOf(tint) + 1) % PALETTE.length];
}

export function notInCatalog(c: AppEntry[], found: DiscoveredApp[]): DiscoveredApp[] {
  var out: DiscoveredApp[] = [];
  for (var i = 0; i < found.length; i++) {
    var dup = false;
    for (var j = 0; j < c.length; j++) if (c[j].id === found[i].id) dup = true;
    if (!dup) out.push(found[i]);
  }
  return out;
}

// Ajoute une app découverte (teinte suivante de la palette) ; un id déjà présent est ignoré.
export function addDiscovered(c: AppEntry[], app: DiscoveredApp): AppEntry[] {
  var r = copy(c);
  for (var i = 0; i < r.length; i++) if (r[i].id === app.id) return r;
  r.push({ id: app.id, name: app.name, icon: app.icon, tint: PALETTE[r.length % PALETTE.length] });
  return r;
}

// Défilement des listes (Réglages, découverte) : lignes de hauteur fixe, une seule couche déplacée par transform.
export var ROW_H = 108;    // ligne 96 + marge 12
export var VIEW_H = 756;   // 7 lignes visibles
export var VISIBLE = VIEW_H / ROW_H;

// Plus petit déplacement qui rend la ligne `pos` entièrement visible ; sans effet si elle l'est déjà.
export function scrollOffset(cur: number, pos: number, total: number): number {
  var top = pos * ROW_H, bottom = top + ROW_H, max = Math.max(0, total * ROW_H - VIEW_H);
  var o = cur;
  if (top < o) o = top;
  if (bottom > o + VIEW_H) o = bottom - VIEW_H;
  return Math.max(0, Math.min(max, o));
}
