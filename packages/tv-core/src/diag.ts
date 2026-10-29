// Horodatages de démarrage + écran de diagnostic caché.
export var marks: { [name: string]: number } = { scriptLoaded: Date.now() };

export function mark(name: 'firstPaint' | 'interactive' | string): void {
  marks[name] = Date.now();
}

export function report(): string {
  var base = marks.scriptLoaded, lines: string[] = [];
  for (var k in marks) if (marks.hasOwnProperty(k)) lines.push(k + ': +' + (marks[k] - base) + ' ms');
  return lines.join('\n');
}

var el: HTMLElement | null = null;
export function toggleDiag(): void {
  if (el) { el.parentNode!.removeChild(el); el = null; return; }
  el = document.createElement('pre');
  el.style.cssText = 'position:fixed;top:0;left:0;margin:0;padding:16px;background:#000;color:#0f0;font:20px monospace;max-width:1888px;word-break:break-all;z-index:9999';
  var ic = iconReport();
  el.textContent = report() + (ic ? '\n\nicônes:\n' + ic : '');
  document.body.appendChild(el);
}

// Icônes d'apps : iconPath brut renvoyé par la TV et résultat du chargement.
// Statuts : '?' (pas encore d'événement ou jamais chargée), 'ok', 'logo' (logo de la bibliothèque), 'échec', 'vide' (iconPath absent).
export interface IconRecord { label: string; path: string; status: string; url?: string; }
var icons: IconRecord[] = [];
var ICON_LINES = 22;                       // tient à côté des horodatages dans 1080 px
var ORDER: { [s: string]: number } = { 'échec': 0, 'vide': 1, '?': 2, 'ok': 3, 'logo': 3 };

export function resetIcons(): void { icons = []; }

// Une seule entrée par (label, chemin) : les rendus répétés réutilisent l'entrée existante.
export function noteIcon(label: string, path: string): IconRecord {
  path = path || '';
  for (var i = 0; i < icons.length; i++) {
    if (icons[i].label === label && icons[i].path === path) return icons[i];
  }
  var r: IconRecord = { label: label, path: path, status: path ? '?' : 'vide' };
  icons.push(r);
  return r;
}

// Les problèmes d'abord (échec, vide), puis inconnus, puis ok ; plafonné, le reste est compté.
export function iconReport(): string {
  var sorted = icons.slice().sort(function (a, b) { return ORDER[a.status] - ORDER[b.status]; });
  var lines: string[] = [];
  for (var i = 0; i < sorted.length && i < ICON_LINES; i++) {
    var r = sorted[i];
    lines.push(r.label + ' [' + r.status + '] ' + (r.path || '(vide)') + (r.url && r.url !== r.path ? ' -> ' + r.url : ''));
  }
  if (sorted.length > ICON_LINES) lines.push('+ ' + (sorted.length - ICON_LINES) + ' autres');
  return lines.join('\n');
}
