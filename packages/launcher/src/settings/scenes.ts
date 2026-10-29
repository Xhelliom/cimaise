// Section « Scènes » des Réglages : adresse et jeton de Home Assistant, choix des scènes de l'accueil (pièce, recherche par lettres),
// ordre réglable. Même langage que la liste des apps : lignes de hauteur fixe, fenêtrage, aucun flou. Chargée avec le chunk Réglages.
import { Key } from '../../../tv-core/src/keys';
import { Scene } from '../../../widgets/src/ha';
import { MAX_SCENES, areasOf, filterScenes, addChosen, removeChosen, moveChosen, normalizeUrl } from '../../../widgets/src/scenes';
import { ROW_H, scrollOffset } from './model';

export interface HaSettings {
  url: string;
  token: string;
  chosen: string[];                                                   // identifiants, dans l'ordre d'affichage
  onConfig: (url: string, token: string) => void;                     // le propriétaire persiste
  onChosen: (ids: string[]) => void;                                  // le propriétaire persiste
  listScenes: (cb: (err: Error | null, scenes?: Scene[]) => void) => void;
}

interface Row { kind: 'url' | 'token' | 'load' | 'room' | 'search' | 'chosen' | 'cand'; id?: string; name?: string; }

var CHIPS = ['Monter', 'Descendre', 'Retirer'];

export interface ScenesView {
  render(): HTMLElement;          // contenu de la section (zone défilante + champ de saisie éventuel)
  press(k: Key): boolean;
  status(): string;
  editing(): boolean;
  open(): void;                   // à l'ouverture de la section : charge les scènes si Home Assistant est configuré
}

export function createScenesView(doc: Document, ha: HaSettings, redraw: () => void): ScenesView {
  var url = ha.url, token = ha.token, chosen = ha.chosen.slice(0, MAX_SCENES);
  var scenes: Scene[] = [], loaded = false, status = '';
  var area: string | null = null, query = '';
  var sel = 0, chip = 0, offset = 0;
  var edit: { field: 'url' | 'token' | 'search'; input: HTMLInputElement } | null = null;

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
    var list = filterScenes(scenes, area, query);
    for (var j = 0; j < list.length; j++) if (chosen.indexOf(list[j].id) < 0) r.push({ kind: 'cand', id: list[j].id, name: list[j].name });
    return r;
  }

  function configured(): boolean { return !!url && !!token; }

  function load(): void {
    if (!configured()) { status = 'Renseigne l’adresse et le jeton.'; redraw(); return; }
    status = 'Chargement des scènes…';
    ha.listScenes(function (err, list) {
      if (err || !list) { status = err ? err.message : 'Home Assistant : réponse vide'; scenes = []; loaded = false; }
      else {
        scenes = list; loaded = true;
        if (area !== null && areasOf(scenes).indexOf(area) < 0) area = null;
        status = list.length + (list.length > 1 ? ' scènes' : ' scène');
      }
      redraw();
    });
    redraw();
  }

  function startEdit(field: 'url' | 'token' | 'search'): void {
    var input = doc.createElement('input') as HTMLInputElement;
    input.className = 'champ';
    input.setAttribute('type', field === 'token' ? 'password' : 'text');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.value = field === 'url' ? url : field === 'token' ? token : query;
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
      else { query = v.replace(/^\s+|\s+$/g, ''); sel = Math.min(sel, rows().length - 1); }
      if (e.field !== 'search' && configured()) { load(); return; }
    }
    redraw();
  }

  function changed(): void { ha.onChosen(chosen.slice(0)); }

  function render(): HTMLElement {
    var rs = rows();
    if (sel >= rs.length) sel = rs.length - 1;
    offset = scrollOffset(offset, sel, rs.length);
    var vue = div('vue'), list = div('liste');
    list.style.transform = 'translateY(' + (offset ? -offset : 0) + 'px)';
    var from = Math.max(0, Math.floor(offset / ROW_H) - 1), to = Math.min(rs.length - 1, Math.ceil(offset / ROW_H) + 7);
    for (var i = from; i <= to; i++) {
      var r = rs[i], on = i === sel, line = div('ligne' + (on ? ' focus' : '') + (on && edit ? ' saisie' : ''));
      var label = '', val = '';
      if (r.kind === 'url') { label = 'Adresse'; val = url || 'Non définie'; }
      else if (r.kind === 'token') { label = 'Jeton'; val = token ? '••••••••' : 'Non défini'; }
      else if (r.kind === 'load') label = 'Charger les scènes';
      else if (r.kind === 'room') { label = 'Pièce'; val = area === null ? 'Toutes' : area; }
      else if (r.kind === 'search') { label = 'Recherche'; val = query || 'Aucune'; }
      else label = r.name || '';
      if (r.kind === 'chosen') line.appendChild(div('rang', '' + (i - 4)));
      line.appendChild(div('nom', label));
      if (r.kind === 'chosen') {
        if (on) for (var c = 0; c < CHIPS.length; c++) line.appendChild(div('puce' + (chip === c ? ' focus' : ''), CHIPS[c]));
      } else if (r.kind === 'cand') {
        if (on) line.appendChild(div('puce focus', 'Ajouter'));
      } else if (val && !(on && edit && r.kind === edit.field)) line.appendChild(div('puce' + (on ? ' focus' : ''), val));
      if (on && edit && r.kind === edit.field) line.appendChild(edit.input);
      line.style.top = i * ROW_H + 'px';
      list.appendChild(line);
    }
    list.style.height = rs.length * ROW_H + 'px';
    vue.appendChild(list);
    return vue;
  }

  function press(k: Key): boolean {
    if (edit) {
      // Pendant la saisie, le clavier de la TV est maître : seuls Entrée (valide) et Retour (annule) sont à nous.
      if (k === 'enter') endEdit(true);
      else if (k === 'back') endEdit(false);
      return true;
    }
    var rs = rows(), r = rs[sel];
    if (k === 'up' || k === 'down') {
      sel = Math.max(0, Math.min(rs.length - 1, sel + (k === 'up' ? -1 : 1)));
      chip = 0;
    } else if (k === 'left' || k === 'right') {
      var d = k === 'left' ? -1 : 1;
      if (r.kind === 'room') stepRoom(d, false);
      else if (r.kind === 'chosen') chip = Math.max(0, Math.min(CHIPS.length - 1, chip + d));
    } else if (k === 'enter') {
      if (r.kind === 'url' || r.kind === 'token' || r.kind === 'search') { startEdit(r.kind); return true; }
      if (r.kind === 'load') { load(); return true; }
      if (r.kind === 'room') stepRoom(1, true);
      else if (r.kind === 'cand') {
        var next = addChosen(chosen, r.id as string);
        if (next === chosen) status = 'Six scènes au plus sur l’accueil.';
        else { chosen = next; status = ''; changed(); }
      } else if (r.kind === 'chosen') {
        var at = chosen.indexOf(r.id as string);
        if (chip === 2) { chosen = removeChosen(chosen, r.id as string); chip = 0; changed(); }
        else {
          var moved = moveChosen(chosen, at, chip === 0 ? -1 : 1);
          if (moved[at] !== chosen[at]) { chosen = moved; sel += chip === 0 ? -1 : 1; changed(); }
        }
      }
    } else return false;
    redraw();
    return true;
  }

  // Pièce suivante/précédente : « Toutes » puis chaque pièce ; Entrée boucle, les flèches s'arrêtent aux bornes.
  function stepRoom(d: number, wrap: boolean): void {
    var opts: Array<string | null> = [null].concat(areasOf(scenes) as any);
    var i = opts.indexOf(area) + d;
    if (i >= opts.length) i = wrap ? 0 : opts.length - 1;
    if (i < 0) i = 0;
    area = opts[i];
    sel = Math.min(sel, rows().length - 1);
  }

  return {
    render: render,
    press: press,
    status: function () { return status; },
    editing: function () { return edit !== null; },
    open: function () { if (configured() && !loaded) load(); }
  };
}
