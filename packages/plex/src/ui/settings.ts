import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { LANG_CHOICES, LANG_MODES, LangMode, langLabel, loadLangPrefs, saveLangPrefs } from '../../../tv-core/src/langprefs';
import { el } from './dom';

var SLOTS = 3;   // langues par liste du mode personnalisé
var ROW_H = 104;

var TOP = 180, HELP_GAP = 104, BLOCK = 370;   // ligne du mode, son aide, puis les lignes suivantes (scène 1920×1080)

// Libellés et aides construits à partir de « Ma langue » (adjectif = libellé en minuscules : français, espagnol…).
function adj(code: string): string { return langLabel(code).toLowerCase(); }
function plural(a: string): string { return /s$/.test(a) ? a : a + 's'; }
function modeLabel(mode: LangMode, mine: string): string {
  return mode === 'vo' ? 'VO sous-titrée en ' + adj(mine) : mode === 'fr' ? 'Doublé en ' + adj(mine) : 'Personnalisé';
}
function modeHelp(mode: LangMode, mine: string): string {
  var a = adj(mine);
  if (mode === 'fr') return 'Audio ' + a + ' s’il existe, sinon VO sous-titrée en ' + a + '.';
  if (mode === 'custom') return 'Audio : votre 1re langue présente dans le film (sinon la VO) ; sous-titres : votre 1re langue disponible, seulement si l’audio n’est dans aucune de vos langues audio.';
  if (mine === 'eng') return 'Film français : audio français, sous-titres anglais. Film américain : audio anglais, sans sous-titres.';
  return 'Film américain : audio anglais, sous-titres ' + plural(a) + '. Film ' + a + ' : audio ' + a + ', sans sous-titres.';
}
function nativeHelp(mine: string): string { return 'Sous-titres et doublage cherchés en ' + adj(mine) + ' d’abord. L’interface reste en français.'; }
var SERIES_NOTE = 'Un choix fait dans le lecteur pendant une série est retenu pour cette série et prime sur ces réglages.';

// Réglages du module Plex : langues audio et sous-titres. Aussi servi par le chunk settings.js (sans plex.js) ; lit et écrit prefs.plexLang (cimaise.v1).
// Gauche / droite / Entrée parcourent les valeurs de la ligne ; chaque changement est enregistré aussitôt.
export function createSettingsPanel(arg: { doc?: Document; store?: Storage }): Panel {
  var doc = arg.doc || document;
  var root = el(doc, 'plex-panel plex-settings');
  var cur = loadLangPrefs(arg.store);
  var mode: LangMode = cur.mode, mine = cur.native;
  var audio = fill(cur.audioList), subs = fill(cur.subList);
  var row = 0;

  function fill(list: string[]): string[] {
    var out = list.slice(0, SLOTS);
    while (out.length < SLOTS) out.push('');
    return out;
  }
  function compact(slots: string[]): string[] {
    var out: string[] = [];
    for (var i = 0; i < slots.length; i++) if (slots[i] && out.indexOf(slots[i]) < 0) out.push(slots[i]);
    return out;
  }

  // Lignes sélectionnables : le mode, puis Ma langue (VO, doublé) ou (mode personnalisé) 3 langues audio et 3 langues de sous-titres.
  // Indice de ligne DOM : 0 mode, 1..6 listes, 7 Ma langue.
  var NATIVE = 1 + 2 * SLOTS;
  function count(): number { return mode === 'custom' ? 1 + 2 * SLOTS : 2; }
  function lineOf(r: number): number { return mode !== 'custom' && r === 1 ? NATIVE : r; }
  function value(r: number): string {
    if (r === 0) return modeLabel(mode, mine);
    if (r === NATIVE) return langLabel(mine);
    var code = r <= SLOTS ? audio[r - 1] : subs[r - 1 - SLOTS];
    return code ? langLabel(code) : 'Aucune';
  }
  function name(r: number): string {
    if (r === 0) return 'Langues du lecteur';
    if (r === NATIVE) return 'Ma langue';
    return r <= SLOTS ? 'Audio ' + r : 'Sous-titres ' + (r - SLOTS);
  }

  function save(): void {
    try { saveLangPrefs({ mode: mode, native: mine, audioList: compact(audio), subList: compact(subs) }, arg.store); } catch (e) { /* stockage refusé : valable pour cette session */ }
  }

  // Un pas dans les valeurs de la ligne ; Entrée (wrap) boucle, les flèches s'arrêtent aux bornes.
  function step(d: number, wrap: boolean): void {
    var opts: string[], now: string, i: number, at = lineOf(row);
    if (at === 0) {
      opts = LANG_MODES;
      now = mode;
    } else if (at === NATIVE) {
      opts = [];
      for (i = 0; i < LANG_CHOICES.length; i++) opts.push(LANG_CHOICES[i].code);
      now = mine;
    } else {
      var isAudio = row <= SLOTS, slots = isAudio ? audio : subs, k = isAudio ? row - 1 : row - 1 - SLOTS;
      opts = isAudio && k === 0 ? [] : [''];   // la première langue audio est obligatoire
      for (i = 0; i < LANG_CHOICES.length; i++) opts.push(LANG_CHOICES[i].code);
      now = slots[k];
    }
    var j = opts.indexOf(now) + d;
    if (j >= opts.length) j = wrap ? 0 : opts.length - 1;
    if (j < 0) j = wrap ? opts.length - 1 : 0;
    if (opts[j] === now) return;
    if (at === 0) mode = opts[j] as LangMode;
    else if (at === NATIVE) mine = opts[j];
    else (row <= SLOTS ? audio : subs)[row <= SLOTS ? row - 1 : row - 1 - SLOTS] = opts[j];
    save();
  }

  // Les lignes sont créées une fois ; seules celles du mode courant sont dans le DOM.
  var lines: HTMLElement[] = [], names: HTMLElement[] = [], vals: HTMLElement[] = [];
  // Aides (texte seul) : sous le mode, sous Ma langue, et le rappel du choix par série en bas du bloc.
  var desc = el(doc, 'plex-set-desc'), nativeDesc = el(doc, 'plex-set-desc'), note = el(doc, 'plex-set-desc plex-set-note', SERIES_NOTE);
  desc.style.top = TOP + HELP_GAP + 'px';
  nativeDesc.style.top = BLOCK + HELP_GAP + 'px';
  root.appendChild(el(doc, 'plex-set-title', 'Réglages'));
  for (var r0 = 0; r0 <= NATIVE; r0++) {
    var line = el(doc, 'plex-set-row');
    // Position fixe en top (posée une fois) : le transform reste libre pour le scale du focus.
    line.style.top = (r0 === 0 ? TOP : r0 === NATIVE ? BLOCK : BLOCK + (r0 - 1) * ROW_H) + 'px';
    names.push(el(doc, 'plex-set-name'));
    vals.push(el(doc, 'plex-set-val'));
    line.appendChild(names[r0]);
    line.appendChild(vals[r0]);
    lines.push(line);
  }
  root.appendChild(desc);
  root.appendChild(note);

  function render(): void {
    var custom = mode === 'custom';
    desc.textContent = modeHelp(mode, mine);
    nativeDesc.textContent = nativeHelp(mine);
    if (custom && nativeDesc.parentNode) root.removeChild(nativeDesc);
    else if (!custom && !nativeDesc.parentNode) root.appendChild(nativeDesc);
    note.style.top = (custom ? BLOCK + 2 * SLOTS * ROW_H + 8 : BLOCK + 2 * HELP_GAP) + 'px';
    for (var r = 0; r < lines.length; r++) {
      var present = custom ? r < NATIVE : r === 0 || r === NATIVE;
      if (present) {
        lines[r].className = 'plex-set-row' + (r === lineOf(row) ? ' on' : '');
        names[r].textContent = name(r);
        vals[r].textContent = value(r);
        if (!lines[r].parentNode) root.appendChild(lines[r]);
      } else if (lines[r].parentNode) root.removeChild(lines[r]);
    }
  }
  render();

  return {
    el: root,
    onKey: function (k: Key): boolean {
      if (k === 'up') { if (row > 0) row--; }
      else if (k === 'down') { if (row < count() - 1) row++; }
      else if (k === 'left' || k === 'right') step(k === 'left' ? -1 : 1, false);
      else if (k === 'enter') step(1, true);
      else return false;
      if (row >= count()) row = count() - 1;
      render();
      return true;
    }
  };
}
