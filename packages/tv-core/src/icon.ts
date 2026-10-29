// Icônes d'apps fournies par la TV (iconPath de getAppsInfo) : normalisation, chargement avec repli, trace de diagnostic.
import { noteIcon } from './diag';

// Variantes à essayer dans l'ordre. Un chemin absolu sans schéma (« /opt/usr/apps/…/icon.png ») se résoudrait
// contre l'origine du widget et échouerait : on tente d'abord file://. Un chemin déjà qualifié reste tel quel.
export function iconCandidates(path: string): string[] {
  if (!path) return [];
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return [path];
  if (path.charAt(0) === '/') return ['file://' + path, path];
  return [path];
}

// Pose l'icône dans `tile` ; chaque échec de chargement passe à la variante suivante, puis au repli (texte).
// Résultat consigné dans le diagnostic (touche 0).
export function applyIcon(doc: Document, tile: HTMLElement, path: string, label: string, fallback: string): void {
  var cands = iconCandidates(path);
  var rec = noteIcon(label, path);
  if (!cands.length) { tile.textContent = fallback; return; }
  var img: any = doc.createElement('img');
  var n = 0;
  rec.status = '?';
  img.onload = function () { rec.status = 'ok'; rec.url = cands[n]; };
  img.onerror = function () {
    n++;
    if (n < cands.length) { img.setAttribute('src', cands[n]); return; }
    rec.status = 'échec';
    if (img.parentNode) img.parentNode.removeChild(img);
    tile.textContent = fallback;
  };
  img.setAttribute('src', cands[0]);
  tile.appendChild(img);
}
