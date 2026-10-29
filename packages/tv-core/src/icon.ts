// Icônes d'apps fournies par la TV (iconPath de getAppsInfo) : normalisation, chargement avec repli, trace de diagnostic.
import { noteIcon, noteEvent } from './diag';

// Variantes à essayer dans l'ordre. Un chemin absolu sans schéma (« /opt/usr/apps/…/icon.png ») se résoudrait
// contre l'origine du widget et échouerait : on tente d'abord file://. Un chemin déjà qualifié reste tel quel.
export function iconCandidates(path: string): string[] {
  if (!path) return [];
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return [path];
  if (path.charAt(0) === '/') return ['file://' + path, path];
  return [path];
}

// Pose l'image dans `tile` : d'abord `logo` (logotype large de la bibliothèque, facultatif), puis l'icône de la TV
// en dernier recours, puis le repli (texte : le nom de l'app). Chaque échec de chargement passe à la variante suivante.
// `onShown` est appelé avec l'image dès qu'elle est chargée (onload) : permet à l'appelant de ne la poser qu'à ce moment.
// Chromium 63 n'a pas img.decode() : le décodage a lieu à la peinture, onload ne prouve pas qu'il est fait.
// Résultat consigné dans le diagnostic (touche 0) ; statut « logo » quand c'est le logo de la bibliothèque qui s'affiche.
export function applyIcon(doc: Document, tile: HTMLElement, path: string, label: string, fallback: string, logo?: string, onShown?: (img: HTMLElement) => void): void {
  var cands = iconCandidates(path);
  var rec = noteIcon(label, path);
  if (logo) cands.unshift(logo);
  if (!cands.length) { tile.textContent = fallback; return; }
  var img: any = doc.createElement('img');
  var n = 0;
  rec.status = '?';
  img.onload = function () { rec.status = logo && n === 0 ? 'logo' : 'ok'; rec.url = cands[n]; noteEvent('logo ' + cands[n].replace(/^.*\//, '')); if (onShown) onShown(img); };
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
