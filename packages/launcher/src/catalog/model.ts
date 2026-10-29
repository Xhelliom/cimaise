// Catalogue d'apps du launcher : fonctions pures, jamais de mutation de l'entrée.
// Distinct de settings/model.ts (AppEntry, teinte) : le branchement de l'écran Réglages sur ce modèle est une autre carte.
export interface CatalogEntry {
  id: string;                  // ID d'app Tizen ; vide tant qu'il n'est pas relevé sur la TV
  name: string;
  color: string;
  icon?: string;
  type: 'interne' | 'tv';
  todo?: string;               // rappel affiché tant que l'ID reste à relever
}
export interface DiscoveredApp { id: string; name: string; icon?: string; }

export var COLORS = ['#e5a00d', '#e50914', '#c4302b', '#113ccf', '#1f8a5b', '#8a3ffc', '#d6336c', '#5a5a5f'];

function copy(c: CatalogEntry[]): CatalogEntry[] { return c.slice(0); }

export function removeApp(c: CatalogEntry[], i: number): CatalogEntry[] {
  var r = copy(c);
  if (i >= 0 && i < r.length) r.splice(i, 1);
  return r;
}

// Déplace l'entrée i de dir (-1 ou +1) ; sans effet aux bornes.
export function moveApp(c: CatalogEntry[], i: number, dir: number): CatalogEntry[] {
  var j = i + dir, r = copy(c);
  if (j < 0 || j >= r.length || i < 0 || i >= r.length) return r;
  var t = r[i]; r[i] = r[j]; r[j] = t;
  return r;
}

// Ajoute une app découverte ; ID vide ou déjà présent : ignorée.
export function addApp(c: CatalogEntry[], app: DiscoveredApp): CatalogEntry[] {
  var r = copy(c);
  if (!app.id) return r;
  for (var i = 0; i < r.length; i++) if (r[i].id === app.id) return r;
  r.push({ id: app.id, name: app.name, icon: app.icon, color: COLORS[r.length % COLORS.length], type: 'tv' });
  return r;
}
