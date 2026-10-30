// Section « Scènes » des Réglages : adresse et jeton de Home Assistant, choix des scènes de l'accueil (pièce, recherche par lettres),
// ordre réglable. Recherche au clavier à l'écran (tv-core), pièces en liste déroulante. Même langage que la liste des apps : lignes de hauteur fixe, fenêtrage, aucun flou. Chargée avec le chunk Réglages.
import { Key } from '../../../tv-core/src/keys';
import { createKeyboard, Keyboard } from '../../../tv-core/src/keyboard';
import { Scene } from '../../../widgets/src/ha';
import { MAX_SCENES, areasOf, countByArea, groupByArea, filterScenes, addChosen, removeChosen, moveChosen, normalizeUrl } from '../../../widgets/src/scenes';
import { ROW_H, scrollOffset } from './model';

export interface HaSettings {
  url: string;
  token: string;
  chosen: string[];                                                   // identifiants, dans l'ordre d'affichage
  onConfig: (url: string, token: string) => void;                     // le propriétaire persiste
  onChosen: (ids: string[]) => void;                                  // le propriétaire persiste
  listScenes: (cb: (err: Error | null, scenes?: Scene[]) => void) => void;
}

interface Row { kind: 'url' | 'token' | 'load' | 'room' | 'search' | 'chosen' | 'cand' | 'head' | 'opt'; id?: string; name?: string; n?: number; }

var CHIPS = ['Monter', 'Descendre', 'Retirer'];

export interface ScenesView {
  render(): HTMLElement;          // contenu de la section (zone défilante + champ de saisie éventuel)
  press(k: Key): boolean;
  status(): string;
  editing(): boolean;
  menuOpen(): boolean;            // liste déroulante des pièces ouverte : Retour la ferme au lieu de quitter la section
  open(): void;                   // à l'ouverture de la section : charge les scènes si Home Assistant est configuré
}

export function createScenesView(doc: Document, ha: HaSettings, redraw: () => void): ScenesView {
  var url = ha.url, token = ha.token, chosen = ha.chosen.slice(0, MAX_SCENES);
  var scenes: Scene[] = [], loaded = false, status = '';
  var area: string | null = null, query = '';
  var sel = 0, chip = 0, offset = 0;
  var edit: { field: 'url' | 'token'; input: HTMLInputElement } | null = null;
  var kb: Keyboard | null = null, kbNote: HTMLElement | null = null;   // recherche : clavier à l'écran de tv-core (l'<input> n'ouvre pas le clavier Samsung)
  var menu = -1;                                                       // liste déroulante des pièces : option focalisée, -1 = fermée

  function div(cls: string, text?: string): HTMLElement {
    var d = doc.createElement('div');
    d.className = cls;
    if (text) d.textContent = text;
    return d;
  }

  function nameOf(id: string): string {
    for (var i = 0; i < scenes.length; i++) if (scenes[i].id === id) return scenes[i].name;
    return id;
  }

  function rows(): Row[] {
    var r: Row[] = [{ kind: 'url' }, { kind: 'token' }, { kind: 'load' }, { kind: 'room' }, { kind: 'search' }];
    for (var i = 0; i < chosen.length; i++) r.push({ kind: 'chosen', id: chosen[i], name: nameOf(chosen[i]) });
    var list = filterScenes(scenes, area, query), rest: Scene[] = [];
    for (var j = 0; j < list.length; j++) if (chosen.indexOf(list[j].id) < 0) rest.push(list[j]);
    if (area !== null) {
      for (var k = 0; k < rest.length; k++) r.push({ kind: 'cand', id: rest[k].id, name: rest[k].name });
    } else {
      var groups = groupByArea(rest);   // « Toutes » : titres de section par pièce
      for (var g = 0; g < groups.length; g++) {
        r.push({ kind: 'head', name: groups[g].area === null ? 'Sans pièce' : groups[g].area as string });
        for (var m = 0; m < groups[g].scenes.length; m++) r.push({ kind: 'cand', id: groups[g].scenes[m].id, name: groups[g].scenes[m].name });
      }
    }
    return r;
  }

  // Ramène `sel` sur la ligne focalisable la plus proche (jamais un titre de section) après tout changement de rows().
  function settle(): void {
    var rs = rows();
    if (sel >= rs.length) sel = rs.length - 1;
    var up = sel, down = sel;
    while (down < rs.length && rs[down].kind === 'head') down++;
    while (up >= 0 && rs[up].kind === 'head') up--;
    if (down < rs.length) sel = down; else if (up >= 0) sel = up;
  }

  // Options de la liste déroulante : « Toutes » en tête, puis chaque pièce avec son nombre de scènes disponibles.
  function options(): Row[] {
    var c = countByArea(scenes), names = areasOf(scenes);
    var o: Row[] = [{ kind: 'opt', name: 'Toutes', n: c.total }];
    for (var i = 0; i < names.length; i++) if (c.byArea[names[i]]) o.push({ kind: 'opt', id: names[i], name: names[i], n: c.byArea[names[i]] });   // pièce sans scène disponible : omise
    return o;
  }

  function configured(): boolean { return !!url && !!token; }

  function load(): void {
    if (!configured()) { status = 'Renseigne l’adresse et le jeton.'; redraw(); return; }
    status = 'Chargement des scènes…';
    ha.listScenes(function (err, list) {
      if (err || !list) { status = err ? err.message : 'Home Assistant : réponse vide'; scenes = []; loaded = false; }
      else {
        scenes = list; loaded = true;
        if (area !== null && !countByArea(scenes).byArea[area]) area = null;
        status = list.length + (list.length > 1 ? ' scènes' : ' scène');
      }
      redraw();
    });
    redraw();
  }

  function startKeyboard(): void {
    var box = doc.createElement('div');
    box.className = 'clavier';
    kbNote = div('etat');
    box.appendChild(kbNote);
    var host = div('clavier-zone');
    box.appendChild(host);
    kbBox = box;
    kb = createKeyboard({
      container: host, doc: doc, value: query, placeholder: 'Nom de la scène',
      onChange: function (v) { query = v; countNote(); },   // filtrage au fil de la saisie
      onSubmit: endKeyboard,
      onCancel: endKeyboard
    });
    countNote();
    redraw();
  }
  var kbBox: HTMLElement | null = null;

  function countNote(): void {
    if (!kbNote) return;
    var n = filterScenes(scenes, area, query).length;
    kbNote.textContent = n + (n > 1 ? ' scènes' : ' scène');
  }

  function endKeyboard(): void {
    if (kb) kb.destroy();
    kb = null; kbNote = null; kbBox = null;
    query = query.replace(/^\s+|\s+$/g, '');
    settle();
    redraw();
  }

  function startEdit(field: 'url' | 'token'): void {
    var input = doc.createElement('input') as HTMLInputElement;
    input.className = 'champ';
    input.setAttribute('type', field === 'token' ? 'password' : 'text');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.value = field === 'url' ? url : token;
    edit = { field: field, input: input };
    redraw();
    input.focus(); // sur la TV, le focus d'un champ ouvre le clavier à l'écran
  }

  function endEdit(commit: boolean): void {
    var e = edit;
    if (!e) return;
    var v = e.input.value;
    edit = null;
    if (commit) {
      if (e.field === 'url') { url = normalizeUrl(v); ha.onConfig(url, token); }
      else if (e.field === 'token') { token = v.replace(/\s+/g, ''); ha.onConfig(url, token); }
      if (configured()) { load(); return; }
    }
    redraw();
  }

  function changed(): void { ha.onChosen(chosen.slice(0)); }

  function render(): HTMLElement {
    if (kbBox) return kbBox;
    var inMenu = menu >= 0;
    if (!inMenu) settle();
    var rs = inMenu ? options() : rows(), at = inMenu ? menu : sel;
    if (at >= rs.length) at = rs.length - 1;
    offset = scrollOffset(offset, at, rs.length);
    var vue = div('vue'), list = div('liste');
    list.style.transform = 'translateY(' + (offset ? -offset : 0) + 'px)';
    var from = Math.max(0, Math.floor(offset / ROW_H) - 1), to = Math.min(rs.length - 1, Math.ceil(offset / ROW_H) + 7);
    for (var i = from; i <= to; i++) {
      var r = rs[i], on = i === at, line = div('ligne' + (r.kind === 'head' ? ' titre' : '') + (r.kind === 'chosen' ? ' choisie' : '') + (on ? ' focus' : '') + (on && edit ? ' saisie' : ''));
      var label = '', val = '';
      if (r.kind === 'url') { label = 'Adresse'; val = url || 'Non définie'; }
      else if (r.kind === 'token') { label = 'Jeton'; val = token ? '••••••••' : 'Non défini'; }
      else if (r.kind === 'load') label = 'Charger les scènes';
      else if (r.kind === 'room') { label = 'Pièce'; val = area === null ? 'Toutes' : area; }
      else if (r.kind === 'search') { label = 'Recherche'; val = query || 'Aucune'; }
      else label = r.name || '';
      if (r.kind === 'opt') val = '' + r.n;
      if (r.kind === 'opt' && r.id === (area === null ? undefined : area) ) line.appendChild(div('rang', '✓'));
      if (r.kind === 'chosen') line.appendChild(div('rang', '✓ ' + (i - 4)));
      line.appendChild(div('nom', label));
      if (r.kind === 'chosen') {
        if (on) for (var c = 0; c < CHIPS.length; c++) line.appendChild(div('puce' + (chip === c ? ' focus' : ''), CHIPS[c]));
      } else if (r.kind === 'cand') {
        if (on) line.appendChild(div('puce focus', 'Ajouter'));
      } else if (r.kind === 'opt' || r.kind === 'head') { if (val) line.appendChild(div('puce', val)); }
      else if (val && !(on && edit && r.kind === edit.field)) line.appendChild(div('puce' + (on ? ' focus' : ''), val));
      if (on && edit && r.kind === edit.field) line.appendChild(edit.input);
      line.style.top = i * ROW_H + 'px';
      list.appendChild(line);
    }
    list.style.height = rs.length * ROW_H + 'px';
    vue.appendChild(list);
    return vue;
  }

  function press(k: Key): boolean {
    if (kb) { kb.handleKey(k); return true; }   // clavier à l'écran : maître jusqu'à « valider » ou Retour
    if (menu >= 0) {
      var os = options();
      if (k === 'up' || k === 'down') menu = Math.max(0, Math.min(os.length - 1, menu + (k === 'up' ? -1 : 1)));
      else if (k === 'enter' || k === 'back') {
        if (k === 'enter') area = os[menu].id === undefined ? null : (os[menu].id as string);
        menu = -1; offset = 0; sel = 3;
      } else return false;
      redraw();
      return true;
    }
    if (edit) {
      // Pendant la saisie, le clavier de la TV est maître : seuls Entrée (valide) et Retour (annule) sont à nous.
      // Les autres touches (flèches du curseur) vont au champ.
      if (k === 'enter') { endEdit(true); return true; }
      if (k === 'back') { endEdit(false); return true; }
      return false;
    }
    var rs = rows(), r = rs[sel];
    if (k === 'up' || k === 'down') {
      var step = k === 'up' ? -1 : 1, to = sel + step;
      while (to >= 0 && to < rs.length && rs[to].kind === 'head') to += step;   // les titres de section ne prennent pas le focus
      if (to >= 0 && to < rs.length) sel = to;
      chip = 0;
    } else if (k === 'left' || k === 'right') {
      var d = k === 'left' ? -1 : 1;
      if (r.kind === 'chosen') chip = Math.max(0, Math.min(CHIPS.length - 1, chip + d));
    } else if (k === 'enter') {
      if (r.kind === 'url' || r.kind === 'token') { startEdit(r.kind); return true; }
      if (r.kind === 'search') { startKeyboard(); return true; }
      if (r.kind === 'load') { load(); return true; }
      if (r.kind === 'room') { var os2 = options(), cur = 0; for (var q = 1; q < os2.length; q++) if (os2[q].id === area) cur = q; menu = cur; offset = 0; }
      else if (r.kind === 'cand') {
        var next = addChosen(chosen, r.id as string);
        if (next === chosen) status = 'Six scènes au plus sur l’accueil.';
        else {
          var after = sel + 1;   // le focus passe à la candidate suivante (la ligne choisie s'insère au-dessus)
          while (after < rs.length && rs[after].kind !== 'cand') after++;
          var keep = after < rs.length ? rs[after].id : undefined;
          chosen = next; status = ''; changed();
          var nrs = rows();
          for (var z = 0; keep && z < nrs.length; z++) if (nrs[z].kind === 'cand' && nrs[z].id === keep) sel = z;
          settle();
        }
      } else if (r.kind === 'chosen') {
        var at = chosen.indexOf(r.id as string);
        if (chip === 2) { chosen = removeChosen(chosen, r.id as string); chip = 0; changed(); settle(); }
        else {
          var moved = moveChosen(chosen, at, chip === 0 ? -1 : 1);
          if (moved[at] !== chosen[at]) { chosen = moved; sel += chip === 0 ? -1 : 1; changed(); }
        }
      }
    } else return false;
    redraw();
    return true;
  }

  return {
    render: render,
    press: press,
    status: function () { return status; },
    editing: function () { return edit !== null || kb !== null; },
    menuOpen: function () { return menu >= 0; },
    open: function () { if (configured() && !loaded) load(); }
  };
}
