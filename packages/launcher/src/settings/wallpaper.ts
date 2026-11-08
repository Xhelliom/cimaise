// Section « Fond d'écran » des Réglages (proposée seulement si le paquet fournit une clé Unsplash) : source (Désactivé, un thème
// Unsplash, recherche libre), recherche au clavier à l'écran, photos en portrait. Les thèmes sont demandés à l'ouverture de la
// section (cache 30 jours), jamais au démarrage. Toute modification remplace l'image du jour au prochain affichage de l'accueil.
import { Key } from '../../../tv-core/src/keys';
import { createKeyboard, Keyboard } from '../../../tv-core/src/keyboard';
import { ROW_H } from './model';
import { ScenesView } from './scenes';
import { WallpaperPrefs, Topic, normalizeWallpaper, DEFAULT_TOPIC } from '../wallpaper/model';

export interface WallpaperSettings {
  value: WallpaperPrefs;
  onChange: (v: WallpaperPrefs) => void;                                // le propriétaire persiste
  topics: (cb: (err: Error | null, list?: Topic[]) => void) => void;    // GET /topics (ou cache)
  onNext?: () => void;   // « Changer d'image » : l'image du jour est abandonnée, une autre est tirée au retour à l'accueil
}

type Row = 'source' | 'query' | 'portrait' | 'next';
var CHANGED = 'Nouvelle image au prochain affichage de l’accueil.';

// Choix de la source dans l'ordre parcouru aux flèches : Désactivé, les thèmes, puis la recherche (si un mot est saisi).
interface Choice { source: 'off' | 'topic' | 'query'; topic?: Topic; }

export function createWallpaperView(doc: Document, ws: WallpaperSettings, redraw: () => void): ScenesView {
  var v = normalizeWallpaper(ws.value);
  var topics: Topic[] = [{ id: v.topicId, title: v.topicTitle }];
  if (v.topicId !== DEFAULT_TOPIC.id) topics.unshift(DEFAULT_TOPIC);
  var sel = 0, status = '', kb: Keyboard | null = null, kbBox: HTMLElement | null = null;
  var ROWS: Row[] = ws.onNext ? ['source', 'query', 'portrait', 'next'] : ['source', 'query', 'portrait'];

  function div(cls: string, text?: string): HTMLElement {
    var d = doc.createElement('div');
    d.className = cls;
    if (text) d.textContent = text;
    return d;
  }

  function choices(): Choice[] {
    var c: Choice[] = [{ source: 'off' }];
    for (var i = 0; i < topics.length; i++) c.push({ source: 'topic', topic: topics[i] });
    if (v.query) c.push({ source: 'query' });
    return c;
  }
  function current(c: Choice[]): number {
    for (var i = 0; i < c.length; i++) {
      if (c[i].source !== v.source) continue;
      if (v.source !== 'topic' || c[i].topic!.id === v.topicId) return i;
    }
    return 0;
  }
  function commit(): void { v = normalizeWallpaper(v); ws.onChange(v); status = CHANGED; }

  function stepSource(d: number, wrap: boolean): void {
    var c = choices(), i = current(c) + d;
    if (i >= c.length) i = wrap ? 0 : c.length - 1;
    if (i < 0) i = 0;
    var n = c[i];
    if (n.source === v.source && (n.source !== 'topic' || n.topic!.id === v.topicId)) return;
    v.source = n.source;
    if (n.topic) { v.topicId = n.topic.id; v.topicTitle = n.topic.title; }
    commit();
  }

  function startKeyboard(): void {
    var box = div('clavier');
    box.appendChild(div('etat', 'Recherche Unsplash (ex. montagne brume) ; vide = retour au thème'));
    var host = div('clavier-zone');
    box.appendChild(host);
    kbBox = box;
    kb = createKeyboard({
      container: host, doc: doc, value: v.query, placeholder: 'Mots-clés', maxLength: 60,
      onSubmit: function (val) { endKeyboard(val); },
      onCancel: function () { endKeyboard(null); }
    });
    redraw();
  }
  function endKeyboard(val: string | null): void {
    if (kb) kb.destroy();
    kb = null; kbBox = null;
    if (val !== null) {
      var q = val.replace(/\s+/g, ' ').replace(/^ | $/g, '');
      if (q !== v.query || (q && v.source !== 'query') || (!q && v.source === 'query')) {
        v.query = q;
        v.source = q ? 'query' : v.source === 'query' ? 'topic' : v.source;
        commit();
      }
    }
    redraw();
  }

  function label(r: Row): string {
    if (r === 'source') return v.source === 'off' ? 'Désactivé (fond teinté)' : v.source === 'query' ? 'Recherche libre' : 'Thème : ' + v.topicTitle;
    if (r === 'query') return v.query || 'Aucune';
    return v.portrait ? 'Oui' : 'Non';
  }
  var NAMES: { [r: string]: string } = { source: 'Source', query: 'Recherche', portrait: 'Photos en portrait', next: 'Changer d’image' };

  function render(): HTMLElement {
    if (kbBox) return kbBox;
    var vue = div('vue'), list = div('liste');
    for (var i = 0; i < ROWS.length; i++) {
      var on = i === sel, line = div('ligne' + (on ? ' focus' : ''));
      line.appendChild(div('nom', NAMES[ROWS[i]]));
      if (ROWS[i] !== 'next') line.appendChild(div('puce' + (on ? ' focus' : ''), (on && ROWS[i] === 'source' ? '‹ ' : '') + label(ROWS[i]) + (on && ROWS[i] === 'source' ? ' ›' : '')));
      line.style.top = i * ROW_H + 'px';
      list.appendChild(line);
    }
    list.style.height = ROWS.length * ROW_H + 'px';
    vue.appendChild(list);
    return vue;
  }

  function press(k: Key): boolean {
    if (kb) { kb.handleKey(k); return true; }
    var r = ROWS[sel];
    if (k === 'up' || k === 'down') sel = Math.max(0, Math.min(ROWS.length - 1, sel + (k === 'up' ? -1 : 1)));
    else if (k === 'left' || k === 'right') {
      if (r === 'source') stepSource(k === 'left' ? -1 : 1, false);
      else if (r === 'portrait' && v.portrait !== (k === 'right')) { v.portrait = k === 'right'; commit(); }
    } else if (k === 'enter') {
      if (r === 'source') stepSource(1, true);
      else if (r === 'query') { startKeyboard(); return true; }
      else if (r === 'next') { if (v.source === 'off') status = 'Source désactivée : choisis un thème ou une recherche.'; else { ws.onNext!(); status = CHANGED; } }
      else { v.portrait = !v.portrait; commit(); }
    } else return false;
    redraw();
    return true;
  }

  return {
    render: render,
    press: press,
    status: function () { return kb ? '' : status; },
    editing: function () { return kb !== null; },
    menuOpen: function () { return false; },
    open: function () {
      status = 'Chargement des thèmes Unsplash…';
      ws.topics(function (err, list) {
        if (err || !list || !list.length) { status = 'Thèmes indisponibles' + (err ? ' (' + err.message + ')' : '') + '.'; redraw(); return; }
        topics = list.slice(0);
        // Le thème choisi reste dans la liste même s'il n'est plus proposé.
        var found = false;
        for (var i = 0; i < topics.length; i++) if (topics[i].id === v.topicId) found = true;
        if (!found) topics.unshift({ id: v.topicId, title: v.topicTitle });
        status = '';
        redraw();
      });
    }
  };
}
