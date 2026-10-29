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

// Icônes d'apps : iconPath brut renvoyé par la TV et résultat du chargement (« ? » tant qu'aucun événement).
export interface IconRecord { label: string; path: string; status: string; url?: string; }
var icons: IconRecord[] = [];

export function noteIcon(label: string, path: string): IconRecord {
  var r: IconRecord = { label: label, path: path, status: '?' };
  icons.push(r);
  return r;
}

export function iconReport(): string {
  var lines: string[] = [];
  for (var i = 0; i < icons.length; i++) {
    var r = icons[i];
    lines.push(r.label + ' [' + r.status + '] ' + r.path + (r.url && r.url !== r.path ? ' -> ' + r.url : ''));
  }
  return lines.join('\n');
}
