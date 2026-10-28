// Faux `tizen.*` et `webapis.*` pour l'aperçu navigateur (HANDOFF §4).
// Règle : ils SIGNALENT l'absence de TV, ils ne simulent jamais un succès.
// Marqueur CIMAISE_MOCK : le build .wgt ne doit jamais le contenir (testé).
declare const Proxy: any;

const w = window as any;
const NO_TV = 'Pas de TV : appel sans effet dans l’aperçu navigateur';
w.__cimaiseMockCalls = [] as string[];

let banner: HTMLElement | null = null;

function show(path: string): void {
  var msg = NO_TV + ' — ' + path + '()';
  console.error('[CIMAISE_MOCK] ' + msg);
  w.__cimaiseMockCalls.push(path);
  var doc = document;
  if (!doc.body) return;
  if (!banner) {
    banner = doc.createElement('div');
    banner.setAttribute('id', 'cimaise-mock-banner');
    banner.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:8px 16px;' +
      'background:#b00020;color:#fff;font:20px monospace;white-space:pre-wrap';
    doc.body.appendChild(banner);
  }
  banner.textContent = msg + ' (×' + w.__cimaiseMockCalls.length + ')';
}

// Chaque propriété est un objet-fonction : toute navigation puis tout appel signale et lève.
function noTv(path: string): any {
  var target = function () {};
  return new Proxy(target, {
    get: function (_t: any, key: string) {
      return typeof key === 'string' ? noTv(path + '.' + key) : undefined;
    },
    apply: function () {
      show(path);
      throw new Error(NO_TV + ' (' + path + ')');
    },
  });
}

w.tizen = noTv('tizen');
w.webapis = noTv('webapis');
