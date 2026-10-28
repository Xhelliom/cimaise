// Coquille de l'aperçu : scène 1920×1080 mise à l'échelle, bascule 1280×720,
// télécommande au clavier (flèches, Entrée, Échap = Retour, touche Tizen 10009).
const KEYS: { [k: string]: [string, number] } = {
  ArrowLeft: ['Left', 37], ArrowUp: ['Up', 38], ArrowRight: ['Right', 39], ArrowDown: ['Down', 40],
  Enter: ['OK', 13], Escape: ['Back', 10009],
};

const frame = document.getElementById('scene') as HTMLIFrameElement;
const hud = document.getElementById('hud') as HTMLElement;
let size = { w: 1920, h: 1080 };

function fit(): void {
  var s = Math.min(window.innerWidth / size.w, window.innerHeight / size.h);
  frame.style.width = size.w + 'px';
  frame.style.height = size.h + 'px';
  frame.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
  hud.textContent = size.w + '×' + size.h + ' · échelle ' + s.toFixed(2) + ' · ' + hud.getAttribute('data-key');
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'r' && !e.ctrlKey && !e.metaKey) { frame.contentWindow!.location.reload(); return; }
  if (e.key === 's') { size = size.w === 1920 ? { w: 1280, h: 720 } : { w: 1920, h: 1080 }; fit(); return; }
  var m = KEYS[e.key];
  if (!m) return;
  e.preventDefault();
  hud.setAttribute('data-key', m[0]);
  fit();
  // Les touches de télécommande Tizen sont reçues par l'app comme keydown/keyCode.
  var doc = frame.contentDocument;
  if (!doc || (e.target as any).ownerDocument === doc) return; // déjà reçue par l'app
  var ev = doc.createEvent('Event') as any;
  ev.initEvent('keydown', true, true);
  ev.key = e.key; ev.keyCode = m[1];
  doc.dispatchEvent(ev);
}

window.addEventListener('keydown', onKey);
frame.addEventListener('load', function () {
  frame.contentWindow!.addEventListener('keydown', function (e) {
    var m = KEYS[e.key];
    if (m && e.keyCode !== m[1]) { // Échap : l'app attend 10009
      e.preventDefault();
      var ev = frame.contentDocument!.createEvent('Event') as any;
      ev.initEvent('keydown', true, true);
      ev.key = e.key; ev.keyCode = m[1];
      frame.contentDocument!.dispatchEvent(ev);
      e.stopImmediatePropagation();
    }
    onKey(e);
  }, true);
  frame.contentWindow!.focus();
});
window.addEventListener('resize', fit);
hud.setAttribute('data-key', '—');
fit();
