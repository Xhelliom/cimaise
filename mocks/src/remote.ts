// Télécommande clavier de l'aperçu : une touche = exactement un keydown reçu par l'app.
const KEYS: { [k: string]: [string, number] } = {
  ArrowLeft: ['Left', 37], ArrowUp: ['Up', 38], ArrowRight: ['Right', 39], ArrowDown: ['Down', 40],
  Enter: ['OK', 13], Escape: ['Back', 10009], // Échap = Retour (keyCode Tizen 10009)
};

export interface RemoteHooks { hud(name: string): void; reload(): void; toggleSize(): void; }

export function attach(top: any, frame: any, hooks: RemoteHooks): void {
  function deliver(e: any, code: number): void {
    var doc = frame.contentDocument;
    var ev = doc.createEvent('Event');
    ev.initEvent('keydown', true, true);
    ev.key = e.key; ev.keyCode = code;
    ev.__cimaise = true; // synthétique : jamais ré-traité
    doc.dispatchEvent(ev);
  }
  function handle(e: any, fromApp: boolean): void {
    if (e.__cimaise) return;
    if (e.key === 'r' && !e.ctrlKey && !e.metaKey) { hooks.reload(); return; }
    if (e.key === 's') { hooks.toggleSize(); return; }
    var m = KEYS[e.key];
    if (!m) return;
    e.preventDefault();
    hooks.hud(m[0]);
    if (fromApp && e.keyCode === m[1]) return; // l'app la reçoit déjà telle quelle
    if (fromApp) e.stopImmediatePropagation(); // remplacée par la version au bon keyCode
    deliver(e, m[1]);
  }
  top.addEventListener('keydown', function (e: any) { handle(e, false); });
  frame.addEventListener('load', function () {
    frame.contentWindow.addEventListener('keydown', function (e: any) { handle(e, true); }, true);
    frame.contentWindow.focus();
  });
}
