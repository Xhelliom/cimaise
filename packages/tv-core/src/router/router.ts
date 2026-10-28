import { Key } from '../keys';
import { exitApp } from '../device';
import { Lazy } from './lazy';

// Un écran de la pile. Seul le panneau du dessus est dans le DOM.
export interface Panel {
  el: HTMLElement;
  onKey?(key: Key): boolean;   // true = touche consommée
  suspend?(): void;            // recouvert par un autre panneau (el vient d'être retiré du DOM)
  resume?(): void;             // redevient le sommet (el vient d'être remis dans le DOM)
  destroy?(): void;            // dépilé définitivement
}

export interface ExitContext { confirm(): void; cancel(): void; }

export interface RouterOptions {
  root: HTMLElement;
  exit?: () => void;
  createExitConfirm?: (ctx: ExitContext) => Panel;
}

function detach(el: HTMLElement): void {
  if (el.parentNode) el.parentNode.removeChild(el);
}

// Libère les bitmaps décodés d'un écran quitté.
function releaseImages(el: HTMLElement): void {
  if (!el.getElementsByTagName) return;
  var imgs = el.getElementsByTagName('img');
  for (var i = 0; i < imgs.length; i++) imgs[i].removeAttribute('src');
}

function defaultExitConfirm(ctx: ExitContext): Panel {
  var el = document.createElement('div');
  el.className = 'exit-confirm';
  var yes = document.createElement('button');
  var no = document.createElement('button');
  yes.textContent = 'Quitter';
  no.textContent = 'Rester';
  el.appendChild(no);
  el.appendChild(yes);
  var onYes = false;
  function paint(): void {
    yes.className = onYes ? 'focus' : '';
    no.className = onYes ? '' : 'focus';
  }
  paint();
  return {
    el: el,
    onKey: function (k) {
      if (k === 'left' || k === 'right') { onYes = !onYes; paint(); return true; }
      if (k === 'enter') { if (onYes) ctx.confirm(); else ctx.cancel(); return true; }
      return false;
    }
  };
}

export class Router {
  private stack: Panel[] = [];
  private root: HTMLElement;
  private exit: () => void;
  private makeConfirm: (ctx: ExitContext) => Panel;

  constructor(opts: RouterOptions) {
    this.root = opts.root;
    this.exit = opts.exit || exitApp;
    this.makeConfirm = opts.createExitConfirm || defaultExitConfirm;
  }

  get depth(): number { return this.stack.length; }

  push(panel: Panel): void {
    var prev = this.stack[this.stack.length - 1];
    if (prev) { detach(prev.el); if (prev.suspend) prev.suspend(); }
    this.stack.push(panel);
    this.root.appendChild(panel.el);
  }

  pop(): void {
    var top = this.stack.pop();
    if (!top) return;
    this.dispose(top);
    var now = this.stack[this.stack.length - 1];
    if (now) { this.root.appendChild(now.el); if (now.resume) now.resume(); }
  }

  // Remplace le sommet sans passer par l'écran précédent.
  replace(panel: Panel): void {
    var top = this.stack.pop();
    if (top) this.dispose(top);
    this.stack.push(panel);
    this.root.appendChild(panel.el);
  }

  // Charge le module à la première ouverture ; en cas d'échec la pile reste inchangée.
  pushLazy<T>(mod: Lazy<T>, build: (m: T) => Panel, onError?: (err: Error) => void): void {
    var self = this;
    mod.get(function (m) { self.push(build(m)); }, onError);
  }

  // Renvoie true si la touche est consommée. Retour dépile ; à la racine il ouvre la confirmation de sortie.
  handleKey(key: Key): boolean {
    var top = this.stack[this.stack.length - 1];
    if (top && top.onKey && top.onKey(key)) return true;
    if (key !== 'back') return false;
    if (this.stack.length > 1) this.pop();
    else this.openExitConfirm();
    return true;
  }

  private openExitConfirm(): void {
    var self = this;
    var panel: Panel = this.makeConfirm({
      confirm: function () { self.exit(); },
      cancel: function () { if (self.stack[self.stack.length - 1] === panel) self.pop(); }
    });
    this.push(panel);
  }

  private dispose(p: Panel): void {
    detach(p.el);
    releaseImages(p.el);
    if (p.destroy) p.destroy();
  }
}
