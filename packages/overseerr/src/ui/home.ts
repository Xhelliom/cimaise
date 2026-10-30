import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { createRow, TileInfo, VirtualList } from '../../../tv-core/src/virtual/list';
import { Abortable, Availability, Callback, Http, OverseerrConfig, Title, TitlePage } from '../api/types';
import { appendTitles, posterUrl } from '../api/media';
import { discoverMovies, discoverTv } from '../api/client';

// Accueil Overseerr (maquette validée, packages/overseerr/mockups/accueil.html) : « Films du moment » et « Séries du moment »,
// deux rangées virtualisées de 240×360. Une page (20 titres) chacune à l'ouverture, la suivante quand le focus approche de la fin.
// Affiches TMDB w185 (≈ 10 Ko, 185×278 décodé) étirées à 240×360 : jamais plus grandes que l'affichage (w342 le serait).
// Le CSS est injecté par le chunk à la première ouverture : rien dans app.css.
export var CSS =
  '.ov{position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:hidden;background:#0f172a;color:#f1f5f9;font-family:Outfit,sans-serif;font-weight:300}' +
  '.ov-head{position:absolute;left:120px;top:48px}' +
  '.ov-sur{font-size:24px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:#a5b4fc}' +
  '.ov-h{margin-top:12px;font-size:56px;font-weight:500;letter-spacing:-.02em;line-height:1}' +
  '.ov-st{position:absolute;right:120px;top:84px;font-size:28px;color:#94a3b8}' +
  '.ov-row{position:absolute;left:0;width:1920px;height:470px;overflow:hidden}' +
  '.ov-r1{top:160px}.ov-r2{top:610px}' +
  '.ov-t{margin-left:120px;height:52px;font-size:36px;font-weight:500}' +
  '.ov-box{position:absolute;left:120px;top:76px}' +
  // La tuile est placée par un transform en ligne (VirtualList) : le zoom porte sur l'affiche, l'anneau sur l'affiche ou,
  // sans affiche, sur la tuile (il passe sous l'affiche zoomée, qui la déborde de 9,6 px).
  '.ov .vtile{border-radius:16px;background:#1e293b}' +
  '.ov .vimg{position:absolute;left:0;top:0;width:240px;height:360px;border-radius:16px;transition:transform .2s ease}' +
  '.ov .vimg:not([src]){visibility:hidden}' +
  '.ov .vlabel{position:absolute;left:20px;bottom:20px;width:200px;font-size:30px;font-weight:500;line-height:1.1;color:rgba(255,255,255,.92)}' +
  '.ov-box.on .vtile.focus{box-shadow:0 0 0 6px rgba(255,255,255,.92);z-index:1}' +
  '.ov-box.on .vtile.focus .vimg{transform:scale(1.08);box-shadow:0 0 0 6px rgba(255,255,255,.92)}' +
  '.ov .vbadge{position:absolute;left:14px;top:14px;height:40px;padding:0 18px;border-radius:20px;font-size:24px;font-weight:500;line-height:40px}' +
  '.ov .vbadge.ok{background:#22c55e;color:#052e16}.ov .vbadge.dem{background:#6366f1;color:#fff}.ov .vbadge.att{background:#f59e0b;color:#1c1917}';

var W = 240, H = 360, GAP = 48;
var AHEAD = 8;   // titres restants avant la fin de la rangée : la page suivante est demandée

// Badge de l'affiche : texte court (240 px de large), couleur de la maquette. Rien pour un titre jamais demandé.
var BADGES: { [a: string]: { text: string; cls: string } } = {
  available: { text: 'Disponible', cls: 'ok' },
  partial: { text: 'Partiel', cls: 'ok' },
  processing: { text: 'Demandé', cls: 'dem' },
  pending: { text: 'En attente', cls: 'att' }
};
export function badgeFor(a: Availability): { text: string; cls: string } | null { return BADGES[a] || null; }

export interface OverseerrArg {
  http: Http;
  config: () => OverseerrConfig | null;   // relue à chaque chargement de page (les Réglages peuvent l'avoir changée)
  imageBase?: string;
  doc?: Document;
  onOpen?: (t: Title) => void;            // fiche (lot suivant) ; absente : Entrée ne fait rien
}

type Load = (http: Http, cfg: OverseerrConfig | null, page: number, cb: Callback<TitlePage>) => Abortable;

interface Row { box: HTMLElement; list: VirtualList; items: Title[]; page: number; total: number; req: Abortable | null; load: Load; }

export function createOverseerrPanel(arg: OverseerrArg): Panel {
  var doc = arg.doc || document;
  function div(cls: string, text?: string): HTMLElement {
    var d = doc.createElement('div');
    d.className = cls;
    if (text) d.textContent = text;
    return d;
  }
  var root = div('ov');
  var head = div('ov-head');
  head.appendChild(div('ov-sur', 'Overseerr'));
  head.appendChild(div('ov-h', 'À découvrir'));
  root.appendChild(head);
  var status = div('ov-st', 'Chargement…');
  root.appendChild(status);
  var active = 0;
  var failed = '';

  function tile(t: Title): TileInfo {
    return { title: t.posterPath ? '' : t.title, image: posterUrl(t.posterPath, 'w185', arg.imageBase), badge: badgeFor(t.availability) };
  }

  function addRow(title: string, cls: string, load: Load): Row {
    var wrap = div('ov-row ' + cls);
    wrap.appendChild(div('ov-t', title));
    var box = div('ov-box');
    wrap.appendChild(box);
    root.appendChild(wrap);
    var r: Row = { box: box, items: [], page: 0, total: 1, req: null, load: load, list: null as any };
    r.list = createRow({
      container: box, doc: doc, count: 0, itemW: W, itemH: H, gap: GAP, viewportW: 1800, viewportH: H,
      render: function (i) { return r.items[i] ? tile(r.items[i]) : null; },
      onSelect: function (i) { if (arg.onOpen && r.items[i]) arg.onOpen(r.items[i]); }
    });
    return r;
  }

  function paint(): void {
    for (var i = 0; i < rows.length; i++) {
      rows[i].box.className = i === active ? 'ov-box on' : 'ov-box';
      rows[i].list.setActive(i === active);
    }
    var empty = !rows[0].items.length && !rows[1].items.length;
    status.textContent = failed && empty ? failed : (empty ? 'Chargement…' : '');
  }

  // Page suivante d'une rangée (une seule requête à la fois) ; les doublons d'une page à l'autre sont écartés (appendTitles).
  function more(r: Row): void {
    if (r.req || r.page >= r.total) return;
    r.req = r.load(arg.http, arg.config(), r.page + 1, function (err, p) {
      r.req = null;
      if (err || !p) { failed = err ? (err.code === 'config' ? 'Overseerr non configuré (Réglages > Apps intégrées)' : 'Échec : ' + err.message) : 'réponse vide'; paint(); return; }
      r.page = p.page;
      r.total = p.totalPages;
      appendTitles(r.items, p.items);
      r.list.setCount(r.items.length);
      paint();
    });
  }

  function near(r: Row): void { if (r.list.focus.index >= r.items.length - AHEAD) more(r); }

  var rows = [addRow('Films du moment', 'ov-r1', discoverMovies), addRow('Séries du moment', 'ov-r2', discoverTv)];
  paint();
  more(rows[0]);
  more(rows[1]);

  return {
    el: root,
    onKey: function (k: Key): boolean {
      if (k === 'up' || k === 'down') {
        var next = k === 'up' ? active - 1 : active + 1;
        if (next < 0 || next >= rows.length) return true;
        active = next;
        paint();
        return true;
      }
      if (k === 'left' || k === 'right' || k === 'enter') {
        var r = rows[active];
        r.list.handleKey(k);
        near(r);
        return true;
      }
      return false;
    },
    suspend: function () { for (var i = 0; i < rows.length; i++) rows[i].list.release(); },
    resume: function () { for (var i = 0; i < rows.length; i++) rows[i].list.restore(); },
    destroy: function () {
      for (var i = 0; i < rows.length; i++) { if (rows[i].req) rows[i].req!.abort(); rows[i].list.release(); }
    }
  };
}
