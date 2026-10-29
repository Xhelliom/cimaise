import { Key } from '../keys';

export interface KeyboardOptions {
  container: HTMLElement;
  value?: string;
  maxLength?: number;
  placeholder?: string;
  onChange?: (value: string) => void;   // à chaque frappe (recherche au fil de la saisie)
  onSubmit?: (value: string) => void;
  onCancel?: () => void;                // touche Retour
  doc?: Document;
}

export interface Keyboard {
  handleKey(key: Key): boolean;         // true si la touche est consommée
  canMove(key: Key): boolean;           // une flèche déplacerait-elle le focus ? (false au bord : l'écran peut passer la main)
  handleKeyCode(code: number): boolean; // touches de couleur et chiffres de la télécommande
  press(action: 'delete' | 'clear' | 'space' | 'submit'): void;
  getValue(): string;
  setValue(value: string): void;        // sans événement change
  focusedLabel(): string;
  destroy(): void;
}

// Touches à enregistrer auprès de tvinputdevice pour que la télécommande les livre (couleurs et chiffres 1–9).
export var KEYBOARD_REGISTER_KEYS = ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

var COLS = 10, KEY_W = 100, KEY_H = 84, GAP = 12, FIELD_H = 96;
var CODE_ACTION: { [code: number]: 'delete' | 'space' | 'clear' | 'submit' } = { 403: 'delete', 404: 'space', 405: 'clear', 406: 'submit' };

interface Def { label: string; kind: string; ch: string; span: number; }

function chars(s: string, kind: string): Def[] {
  var out: Def[] = [];
  for (var i = 0; i < s.length; i++) out.push({ label: s.charAt(i), kind: kind, ch: s.charAt(i), span: 1 });
  return out;
}

// Disposition ABC (plus rapide au D-pad qu'AZERTY) : 4 rangées de 10, puis les actions.
var ROWS: Def[][] = [
  chars('abcdefghij', 'k'),
  chars('klmnopqrst', 'k'),
  chars('uvwxyz', 'k').concat(chars('éèàç', 'k')),
  chars('0123456789', 'k'),
  [
    { label: 'espace', kind: 'space', ch: ' ', span: 3 },
    { label: 'effacer', kind: 'delete', ch: '', span: 2 },
    { label: 'tout effacer', kind: 'clear', ch: '', span: 2 },
    { label: 'valider', kind: 'submit', ch: '', span: 3 }
  ]
];

// Clavier à l'écran piloté au D-pad, indépendant du clavier système. Rendu DOM direct, préalloué :
// un seul repère de focus déplacé par transform, aucun nœud créé à la frappe.
export function createKeyboard(o: KeyboardOptions): Keyboard {
  var doc = o.doc || document;
  var value = o.value || '';
  var row = 0, col = 0, mem = 0;   // mem : colonne mémorisée pour les déplacements verticaux
  var maxLen = o.maxLength === undefined ? 0 : o.maxLength;

  var root = doc.createElement('div');
  root.className = 'kb';
  var field = doc.createElement('div');
  field.className = 'kb-field';
  field.style.position = 'absolute';
  field.style.left = '0px';
  field.style.top = '0px';
  field.style.width = (COLS * KEY_W + (COLS - 1) * GAP) + 'px';
  field.style.height = FIELD_H + 'px';
  var text = doc.createElement('span');
  text.className = 'kb-text';
  var caret = doc.createElement('span');
  caret.className = 'kb-caret';
  field.appendChild(text);
  field.appendChild(caret);
  root.appendChild(field);

  var ring = doc.createElement('div');
  ring.className = 'kb-focus';
  ring.style.position = 'absolute';
  ring.style.left = '0px';
  ring.style.top = '0px';
  root.appendChild(ring);

  var cells: { def: Def; start: number }[][] = [];
  var y0 = FIELD_H + GAP;
  for (var r = 0; r < ROWS.length; r++) {
    var cs = 0, line: { def: Def; start: number }[] = [];
    for (var c = 0; c < ROWS[r].length; c++) {
      var d = ROWS[r][c];
      var el = doc.createElement('div');
      el.className = 'kb-key kb-' + d.kind;
      el.textContent = d.label;
      el.style.position = 'absolute';
      el.style.left = '0px';
      el.style.top = '0px';
      el.style.width = (d.span * KEY_W + (d.span - 1) * GAP) + 'px';
      el.style.height = KEY_H + 'px';
      el.style.transform = 'translate3d(' + (cs * (KEY_W + GAP)) + 'px,' + (y0 + r * (KEY_H + GAP)) + 'px,0)';
      root.appendChild(el);
      line.push({ def: d, start: cs });
      cs += d.span;
    }
    cells.push(line);
  }
  o.container.appendChild(root);

  function at(rr: number, cc: number): number {   // index de la touche qui couvre la colonne cc
    var line = cells[rr], idx = 0;
    for (var i = 0; i < line.length; i++) if (line[i].start <= cc) idx = i;
    return idx;
  }
  function cur(): { def: Def; start: number } { return cells[row][col]; }

  function paintField(): void {
    text.textContent = value === '' && o.placeholder ? o.placeholder : value;
    text.className = value === '' ? 'kb-text kb-empty' : 'kb-text';
  }
  function paintFocus(): void {
    var k = cur(), d = k.def;
    ring.style.width = (d.span * KEY_W + (d.span - 1) * GAP) + 'px';
    ring.style.height = KEY_H + 'px';
    ring.style.transform = 'translate3d(' + (k.start * (KEY_W + GAP)) + 'px,' + (y0 + row * (KEY_H + GAP)) + 'px,0)';
  }

  function change(next: string): void {
    if (next === value) return;
    value = next;
    paintField();
    if (o.onChange) o.onChange(value);
  }
  function press(action: string, ch?: string): void {
    if (action === 'delete') change(value.slice(0, -1));
    else if (action === 'clear') change('');
    else if (action === 'submit') { if (o.onSubmit) o.onSubmit(value); }
    else if (maxLen === 0 || value.length < maxLen) change(value + (ch === undefined ? ' ' : ch));
  }

  function handleKey(key: Key): boolean {
    if (key === 'enter') {
      var d = cur().def;
      press(d.kind === 'k' || d.kind === 'space' ? 'type' : d.kind, d.ch);
      return true;
    }
    if (key === 'back') { if (o.onCancel) o.onCancel(); return true; }
    if (key === 'left' || key === 'right') {
      var ni = col + (key === 'left' ? -1 : 1);
      if (ni >= 0 && ni < cells[row].length) { col = ni; mem = cells[row][col].start; paintFocus(); }
      return true;
    }
    if (key === 'up' || key === 'down') {
      var nr = row + (key === 'up' ? -1 : 1);
      if (nr >= 0 && nr < cells.length) { row = nr; col = at(row, mem); paintFocus(); }
      return true;
    }
    return false;
  }

  function canMove(key: Key): boolean {
    if (key === 'left') return col > 0;
    if (key === 'right') return col < cells[row].length - 1;
    if (key === 'up') return row > 0;
    if (key === 'down') return row < cells.length - 1;
    return false;
  }

  paintField();
  paintFocus();

  return {
    handleKey: handleKey,
    canMove: canMove,
    handleKeyCode: function (code: number): boolean {
      var a = CODE_ACTION[code];
      if (a) { press(a, a === 'space' ? ' ' : undefined); return true; }
      if (code >= 48 && code <= 57) { press('type', String(code - 48)); return true; }
      return false;
    },
    press: function (action) { press(action, action === 'space' ? ' ' : undefined); },
    getValue: function () { return value; },
    setValue: function (v: string) { value = v; paintField(); },
    focusedLabel: function () { return cur().def.label; },
    destroy: function () { o.container.removeChild(root); }
  };
}
