import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { LANG_CHOICES, LANG_MODES, LangMode, langLabel, loadLangPrefs, saveLangPrefs } from '../../../tv-core/src/langprefs';
import { el } from './dom';

var SLOTS = 3;   // langues par liste du mode personnalisé
var ROW_H = 104;

var MODE_LABEL: { [k: string]: string } = { vo: 'VO sous-titrée', fr: 'Français si disponible', custom: 'Personnalisé' };
var MODE_DESC: { [k: string]: string } = {
  vo: 'Audio en version originale. Sous-titres français (anglais à défaut), aucun si la VO est le français.',
  fr: 'Audio français s’il existe, sinon la VO avec des sous-titres français.',
  custom: 'Vos langues audio par ordre de préférence ; des sous-titres seulement si l’audio n’est dans aucune d’elles.'
};

// Réglages du module Plex : langues audio et sous-titres. Aussi servi par le chunk settings.js (sans plex.js) ; lit et écrit prefs.plexLang (cimaise.v1).
// Gauche / droite / Entrée parcourent les valeurs de la ligne ; chaque changement est enregistré aussitôt.
export function createSettingsPanel(arg: { doc?: Document; store?: Storage }): Panel {
  var doc = arg.doc || document;
  var root = el(doc, 'plex-panel plex-settings');
  var cur = loadLangPrefs(arg.store);
  var mode: LangMode = cur.mode;
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

  // Lignes sélectionnables : le mode, puis (mode personnalisé) 3 langues audio et 3 langues de sous-titres.
  function count(): number { return mode === 'custom' ? 1 + 2 * SLOTS : 1; }
  function value(r: number): string {
    if (r === 0) return MODE_LABEL[mode];
    var code = r <= SLOTS ? audio[r - 1] : subs[r - 1 - SLOTS];
    return code ? langLabel(code) : 'Aucune';
  }
  function name(r: number): string {
    if (r === 0) return 'Langues du lecteur';
    return r <= SLOTS ? 'Audio ' + r : 'Sous-titres ' + (r - SLOTS);
  }

  function save(): void {
    try { saveLangPrefs({ mode: mode, audioList: compact(audio), subList: compact(subs) }, arg.store); } catch (e) { /* stockage refusé : valable pour cette session */ }
  }

  // Un pas dans les valeurs de la ligne ; Entrée (wrap) boucle, les flèches s'arrêtent aux bornes.
  function step(d: number, wrap: boolean): void {
    var opts: string[], now: string, i: number;
    if (row === 0) {
      opts = LANG_MODES;
      now = mode;
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
    if (row === 0) mode = opts[j] as LangMode;
    else (row <= SLOTS ? audio : subs)[row <= SLOTS ? row - 1 : row - 1 - SLOTS] = opts[j];
    save();
  }

  // Les lignes sont créées une fois ; seules celles du mode courant sont dans le DOM.
  var lines: HTMLElement[] = [], names: HTMLElement[] = [], vals: HTMLElement[] = [];
  var desc = el(doc, 'plex-set-desc');
  root.appendChild(el(doc, 'plex-set-title', 'Réglages'));
  for (var r0 = 0; r0 < 1 + 2 * SLOTS; r0++) {
    var line = el(doc, 'plex-set-row');
    line.style.transform = 'translate3d(0,' + (r0 === 0 ? 0 : r0 * ROW_H + 72) + 'px,0)';
    names.push(el(doc, 'plex-set-name'));
    vals.push(el(doc, 'plex-set-val'));
    line.appendChild(names[r0]);
    line.appendChild(vals[r0]);
    lines.push(line);
  }
  root.appendChild(desc);

  function render(): void {
    desc.textContent = MODE_DESC[mode];
    for (var r = 0; r < lines.length; r++) {
      var present = r < count();
      if (present) {
        lines[r].className = 'plex-set-row' + (r === row ? ' on' : '');
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
