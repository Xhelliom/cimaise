// Horodatages de démarrage + écran de diagnostic caché.
export var marks: { [name: string]: number } = { scriptLoaded: Date.now() };

export function mark(name: 'firstPaint' | 'interactive' | string): void {
  marks[name] = Date.now();
}

// Latence touche → frame : keydown jusqu'à la 2e requestAnimationFrame (≈ le moment où le mouvement du focus est peint).
var LATENCY_KEEP = 20;
var latencies: number[] = [];
export function resetLatency(): void { latencies = []; }
export function recordLatency(ms: number): void {
  latencies.push(ms);
  if (latencies.length > LATENCY_KEEP) latencies.shift();
}
export function latencyStats(): { n: number; min: number; median: number; max: number } | null {
  if (!latencies.length) return null;
  var s = latencies.slice().sort(function (a, b) { return a - b; });
  var m = Math.floor(s.length / 2);
  return { n: s.length, min: s[0], median: s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2), max: s[s.length - 1] };
}
export function keyLatency(clock?: () => number, raf?: (fn: () => void) => void): void {
  var c = clock || function () { return Date.now(); };
  var r = raf || (typeof requestAnimationFrame !== 'undefined' ? function (fn: () => void) { requestAnimationFrame(fn); } : null);
  if (!r) return;
  var t0 = c();
  r(function () { r!(function () { recordLatency(c() - t0); }); });
}

// Mesures nommées (module Plex) : les 10 dernières durées par type, min/médiane/max. Aucune minuterie : on soustrait deux horodatages.
export var MEASURE_KEEP = 10;
export var MEASURE_LABELS: { [kind: string]: string } = {
  'biblio-cache': 'bibliothèque (cache)',
  'biblio-reseau': 'bibliothèque (réseau)',
  'fiche': 'fiche',
  'lecture': 'lecture (Entrée → 1re image)'
};
var measures: { [kind: string]: number[] } = {};
export function resetMeasures(): void { measures = {}; }
export function recordMeasure(kind: string, ms: number): void {
  var l = measures[kind] || (measures[kind] = []);
  l.push(ms < 0 ? 0 : ms);
  if (l.length > MEASURE_KEEP) l.shift();
}
export function measureStats(kind: string): { n: number; min: number; median: number; max: number } | null {
  var l = measures[kind];
  if (!l || !l.length) return null;
  var s = l.slice().sort(function (a, b) { return a - b; });
  var m = Math.floor(s.length / 2);
  return { n: s.length, min: s[0], median: s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2), max: s[s.length - 1] };
}
// Section « Plex » du diagnostic. La mémoire n'est donnée que si le moteur l'expose (performance.memory).
export function plexReport(): string {
  var lines: string[] = [];
  for (var k in MEASURE_LABELS) if (MEASURE_LABELS.hasOwnProperty(k)) {
    var st = measureStats(k);
    lines.push(MEASURE_LABELS[k] + ': ' + (st ? 'min ' + st.min + ' / méd ' + st.median + ' / max ' + st.max + ' ms (' + st.n + ')' : '—'));
  }
  var mem: any = typeof performance !== 'undefined' ? (performance as any).memory : null;
  if (mem && typeof mem.usedJSHeapSize === 'number') lines.push('mémoire JS: ' + Math.round(mem.usedJSHeapSize / 1048576) + ' Mo');
  return lines.join('\n');
}

export function report(): string {
  var base = marks.scriptLoaded, lines: string[] = [];
  for (var k in marks) if (marks.hasOwnProperty(k)) lines.push(k + ': +' + (marks[k] - base) + ' ms');
  var st = latencyStats();
  if (st) lines.push('latence touche→frame: min ' + st.min + ' / méd ' + st.median + ' / max ' + st.max + ' ms (' + st.n + ')');
  lines.push('Plex', plexReport());
  lines.push('userAgent: ' + (typeof navigator !== 'undefined' ? navigator.userAgent : '(absent)'));
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
