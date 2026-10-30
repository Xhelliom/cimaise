// Section « Overseerr » des Réglages : adresse et clé API saisies au clavier à l'écran (disposition technique : majuscules,
// . - / : =), bouton « Tester ». La clé n'est jamais affichée hors saisie, ni passée à un message. Chargée avec le chunk Réglages.
import { Key } from '../../../tv-core/src/keys';
import { createKeyboard, Keyboard } from '../../../tv-core/src/keyboard';
import { ROW_H } from './model';
import { ScenesView } from './scenes';

export interface OverseerrSettings {
  url: string;                                                        // adresse enregistrée, sinon l'adresse par défaut
  key: string;
  onConfig: (url: string, key: string) => void;                       // le propriétaire persiste
  test: (url: string, key: string, cb: (err: Error | null, text?: string) => void) => void;   // texte du résultat, sans la clé
}

type Field = 'url' | 'key';
var ROWS: Array<Field | 'test'> = ['url', 'key', 'test'];

// Adresse saisie à la télécommande : espaces retirés, « https:// » ajouté sans schéma, pas de « / » final ; vide reste vide.
export function normalizeOverseerrUrl(v: string): string {
  var u = v.replace(/\s+/g, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u.replace(/\/+$/, '');
}

export function createOverseerrView(doc: Document, ov: OverseerrSettings, redraw: () => void): ScenesView {
  var url = ov.url, key = ov.key;
  var sel = 0, status = '', busy = false;
  var kb: Keyboard | null = null, kbBox: HTMLElement | null = null, field: Field = 'url';

  function div(cls: string, text?: string): HTMLElement {
    var d = doc.createElement('div');
    d.className = cls;
    if (text) d.textContent = text;
    return d;
  }

  function startKeyboard(f: Field): void {
    field = f;
    var box = div('clavier');
    box.appendChild(div('etat', f === 'url' ? 'Adresse d’Overseerr' : 'Clé API (Overseerr › Paramètres › Général)'));
    var host = div('clavier-zone');
    box.appendChild(host);
    kbBox = box;
    kb = createKeyboard({
      container: host, doc: doc, layout: 'technique', value: f === 'url' ? url : key,
      placeholder: f === 'url' ? 'https://…' : 'Clé API',
      onSubmit: function (v) { endKeyboard(v); },
      onCancel: function () { endKeyboard(null); }
    });
    redraw();
  }

  function endKeyboard(v: string | null): void {
    if (kb) kb.destroy();
    kb = null; kbBox = null;
    if (v !== null) {
      if (field === 'url') url = normalizeOverseerrUrl(v);
      else key = v.replace(/\s+/g, '');
      status = '';
      ov.onConfig(url, key);
    }
    redraw();
  }

  function test(): void {
    if (!url || !key) { status = 'Renseigne l’adresse et la clé.'; return; }
    if (busy) return;
    busy = true;
    status = 'Test en cours…';
    ov.test(url, key, function (err, text) {
      busy = false;
      status = err ? 'Échec : ' + err.message : text || 'Overseerr répond.';
      redraw();
    });
  }

  function render(): HTMLElement {
    if (kbBox) return kbBox;
    var vue = div('vue'), list = div('liste');
    for (var i = 0; i < ROWS.length; i++) {
      var r = ROWS[i], on = i === sel, line = div('ligne' + (on ? ' focus' : ''));
      if (r === 'test') line.appendChild(div('nom', 'Tester la connexion'));
      else {
        line.appendChild(div('nom', r === 'url' ? 'Adresse' : 'Clé API'));
        line.appendChild(div('puce' + (on ? ' focus' : ''), r === 'url' ? (url || 'Non définie') : (key ? '••••••••' : 'Non définie')));
      }
      line.style.top = i * ROW_H + 'px';
      list.appendChild(line);
    }
    list.style.height = ROWS.length * ROW_H + 'px';
    vue.appendChild(list);
    return vue;
  }

  function press(k: Key): boolean {
    if (kb) { kb.handleKey(k); return true; }   // clavier à l'écran : maître jusqu'à « valider » ou Retour
    if (k === 'up' || k === 'down') sel = Math.max(0, Math.min(ROWS.length - 1, sel + (k === 'up' ? -1 : 1)));
    else if (k === 'enter') {
      var r = ROWS[sel];
      if (r === 'test') test();
      else { startKeyboard(r); return true; }
    } else if (k !== 'left' && k !== 'right') return false;
    redraw();
    return true;
  }

  return {
    render: render,
    press: press,
    status: function () { return kb ? '' : status; },
    editing: function () { return kb !== null; },
    menuOpen: function () { return false; },
    open: function () {}
  };
}
