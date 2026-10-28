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
  el.style.cssText = 'position:fixed;top:0;left:0;margin:0;padding:16px;background:#000;color:#0f0;font:24px monospace;z-index:9999';
  el.textContent = report();
  document.body.appendChild(el);
}
