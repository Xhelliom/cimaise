// Horodatages de démarrage + écran de diagnostic caché.
export var marks: { [name: string]: number } = { scriptLoaded: Date.now() };

export function mark(name: 'firstPaint' | 'interactive' | string): void {
  marks[name] = Date.now();
}

// Latence touche → frame : keydown jusqu'à la 2e requestAnimationFrame (≈ le moment où le mouvement du focus est peint).
var LATENCY_KEEP = 20;
var latencies: Array<{ ms: number; cause: string }> = [];
export function resetLatency(): void { latencies = []; }
export function recordLatency(ms: number, cause?: string): void {
  latencies.push({ ms: ms, cause: cause || '' });
  if (latencies.length > LATENCY_KEEP) latencies.shift();
}

// Événements ponctuels (décodage d'un logo, fondu de teinte…) : horodatés, gardés en petit nombre, rapprochés de chaque appui
// pour désigner la cause d'un pic de latence.
var EVENT_KEEP = 40;
var events: Array<{ t: number; name: string }> = [];
export function resetEvents(): void { events = []; }
export function noteEvent(name: string, t?: number): void {
  events.push({ t: t === undefined ? Date.now() : t, name: name });
  if (events.length > EVENT_KEEP) events.shift();
}
// Lignes libres du diagnostic (ex. « fond » : poids, durée et mémoire de la photo de l'accueil), une par clé.
var notes: { [k: string]: string } = {};
export function diagNote(k: string, text: string): void { notes[k] = text; }
export function usedHeap(): number {
  var mem: any = typeof performance !== 'undefined' ? (performance as any).memory : null;
  return mem && typeof mem.usedJSHeapSize === 'number' ? mem.usedJSHeapSize : -1;
}

export function latencyStats(): { n: number; min: number; median: number; max: number; maxCause: string } | null {
  if (!latencies.length) return null;
  var s = latencies.slice().sort(function (a, b) { return a.ms - b.ms; });
  var m = Math.floor(s.length / 2), top = s[s.length - 1];
  return { n: s.length, min: s[0].ms, median: s.length % 2 ? s[m].ms : Math.round((s[m - 1].ms + s[m].ms) / 2), max: top.ms, maxCause: top.cause || 'inconnue' };
}
export function keyLatency(clock?: () => number, raf?: (fn: () => void) => void): void {
  var c = clock || function () { return Date.now(); };
  var r = raf || (typeof requestAnimationFrame !== 'undefined' ? function (fn: () => void) { requestAnimationFrame(fn); } : null);
  if (!r) return;
  var t0 = c(), h0 = usedHeap();
  r(function () { r!(function () {
    var names: string[] = [];
    for (var i = 0; i < events.length; i++) if (events[i].t >= t0 && names.indexOf(events[i].name) < 0) names.push(events[i].name);
    var h1 = usedHeap();
    if (h0 >= 0 && h1 >= 0 && h1 < h0) names.push('GC probable');
    recordLatency(c() - t0, names.join(', '));
  }); });
}

// Mesures nommées (module Plex) : les 10 dernières durées par type, min/médiane/max. Aucune minuterie : on soustrait deux horodatages.
export var MEASURE_KEEP = 10;
export var MEASURE_LABELS: { [kind: string]: string } = {
  'biblio-cache': 'bibliothèque (cache)',
  'biblio-reseau': 'bibliothèque (réseau)',
  'fiche': 'fiche',
  'lecture': 'lecture (Entrée → 1re image)',
  'frappe': 'recherche : frappe → caractère',
  'recherche': 'recherche : frappe → 1ers résultats',
  'recherche-serveur': 'recherche : frappe → complément serveur'
};
// Chaque bundle (app.js, plex.js) embarque sa propre copie de ce module : les mesures vivent sur window, sinon celles de
// plex.js n'atteindraient jamais le diagnostic d'app.js. Hors navigateur (tests) : variable locale.
var localMeasures: { [kind: string]: number[] } = {};
function store(): { [kind: string]: number[] } {
  if (typeof window === 'undefined') return localMeasures;
  var w: any = window;
  return w.__cimaiseMeasures || (w.__cimaiseMeasures = {});
}
export function resetMeasures(): void { localMeasures = {}; if (typeof window !== 'undefined') (window as any).__cimaiseMeasures = {}; }
export function recordMeasure(kind: string, ms: number): void {
  var m = store();
  var l = m[kind] || (m[kind] = []);
  l.push(ms < 0 ? 0 : ms);
  if (l.length > MEASURE_KEEP) l.shift();
}
export function measureStats(kind: string): { n: number; min: number; median: number; max: number } | null {
  var l = store()[kind];
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

// Journal AVPlay (lecteur) : un appel par ligne, état avant→après, exception. Sur window comme les mesures (plex.js l'écrit,
// app.js l'affiche). Rien en boucle : seulement les appels ponctuels (open, prepare, play, seek, stop…), jamais oncurrentplaytime.
export var AV_KEEP = 30;
var AV_SHOWN = 20;
var localAv: string[] = [];
function avStore(): string[] {
  if (typeof window === 'undefined') return localAv;
  var w: any = window;
  return w.__cimaiseAvLog || (w.__cimaiseAvLog = []);
}
var avT0 = 0;
export function avLog(line: string): void {
  var l = avStore(), t = Date.now();
  if (!avT0) avT0 = t;
  l.push('+' + (t - avT0) + ' ' + line);
  if (l.length > AV_KEEP) l.shift();
}
export function resetAvLog(): void { localAv = []; avT0 = 0; if (typeof window !== 'undefined') (window as any).__cimaiseAvLog = []; }
// last : n'afficher que les dernières lignes (l'écran de diagnostic ne défile pas ; la ligne fautive est toujours la plus récente).
export function avReport(last?: number): string { var l = avStore(); return (last && l.length > last ? l.slice(l.length - last) : l).join('\n'); }

export function report(): string {
  var base = marks.scriptLoaded, lines: string[] = [];
  for (var k in marks) if (marks.hasOwnProperty(k)) lines.push(k + ': +' + (marks[k] - base) + ' ms');
  var st = latencyStats();
  if (st) lines.push('latence touche→frame: min ' + st.min + ' / méd ' + st.median + ' / max ' + st.max + ' ms (' + st.n + ')');
  if (st) lines.push('cause du max: max ' + st.max + ' ms (' + st.maxCause + ')');
  for (var n in notes) if (notes.hasOwnProperty(n)) lines.push(n + ': ' + notes[n]);
  lines.push('Plex', plexReport());
  lines.push('userAgent: ' + (typeof navigator !== 'undefined' ? navigator.userAgent : '(absent)'));
  return lines.join('\n');
}

var el: HTMLElement | null = null;
export function isDiagOpen(): boolean { return el !== null; }
export function toggleDiag(): void {
  if (el) { el.parentNode!.removeChild(el); el = null; return; }
  el = document.createElement('pre');
  el.style.cssText = 'position:fixed;top:0;left:0;margin:0;padding:16px;background:#000;color:#0f0;font:20px monospace;max-width:1888px;word-break:break-all;z-index:9999';
  var ic = iconReport();
  // AVPlay en tête : le bloc pousserait sinon ses dernières lignes (l'erreur) sous le bas de l'écran (vu sur TV2).
  var av = avReport(AV_SHOWN);
  el.textContent = (av ? 'AVPlay (dernières lignes):\n' + av + '\n\n' : '') + report() + (ic ?'\n\nicônes:\n' + ic : '') + '\n\n[1] Sonde formats (lecture directe d’un échantillon par catégorie)\n[2] Sonde Overseerr (HTTPS, lecture seule)';
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
