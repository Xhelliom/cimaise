import { Focus } from '../focus';
import { Key } from '../keys';

export interface TileInfo { title?: string; image?: string | null; selected?: boolean; done?: boolean; progress?: number; badge?: { text: string; cls: string } | null; }  // badge : pastille « vbadge » + cls posée sur la tuile, créée à la demande ; selected : classe « sel », marque permanente distincte du focus ; done : classe « done » (coche « vu ») ; progress (0 à 1) : fine barre en bas de la tuile

export interface VirtualOptions {
  container: HTMLElement;
  count: number;
  itemW: number;
  itemH: number;
  gap: number;
  viewportW: number;
  viewportH: number;
  cols?: number;             // grille verticale (défaut 1) ; ignoré pour une rangée
  horizontal?: boolean;      // rangée : une ligne, défilement horizontal
  margin?: number;           // lignes gardées dans le DOM de part et d'autre du visible (défaut 1)
  pageSize?: number;         // taille de page Plex (X-Plex-Container-Size)
  prefetchLines?: number;    // lignes d'avance pour demander la page suivante (défaut 2)
  render: (index: number) => TileInfo | null; // null = pas encore chargé (gabarit vide)
  onPage?: (start: number, size: number) => void;
  onSelect?: (index: number) => void;
  edge?: HTMLElement;        // indice de débordement : classe « shown » tant que des éléments suivent hors de la fenêtre
  doc?: Document;
}

interface Tile { el: HTMLElement; img: HTMLImageElement; label: HTMLElement; bar: HTMLElement | null; badge: HTMLElement | null; index: number; src: boolean; }

// Liste/grille virtualisée : au plus (lignes visibles, partielles comprises, + 2 × marge) × colonnes nœuds, tous
// préalloués et recyclés. Le défilement est un seul transform sur la couche ; chaque tuile
// n'est repositionnée (transform) que lorsqu'elle change d'index.
export class VirtualList {
  focus: Focus;
  top = 0;                   // première ligne pleinement visible
  private o: VirtualOptions;
  private doc: Document;
  private layer: HTMLElement;
  private cross: number;
  private lineSize: number;
  private fullLines: number;   // lignes entièrement visibles (suivi du focus)
  private visLines: number;    // lignes visibles, partielles comprises (plage DOM, images, pool)
  private margin: number;
  private active: { [i: number]: Tile } = {};
  private free: Tile[] = [];
  private requested: { [page: number]: boolean } = {};
  private on = true;       // liste active : seule sa tuile sélectionnée porte « focus » (sinon « mark », repère discret)
  private held = false;      // écran quitté : aucune image tant que restore() n'a pas été appelé
  private more = false;      // état posé sur o.edge : sa classe n'est touchée que lorsqu'il change

  constructor(o: VirtualOptions) {
    this.o = o;
    this.doc = o.doc || document;
    this.margin = o.margin === undefined ? 1 : o.margin;
    this.cross = o.horizontal ? 1 : Math.max(1, o.cols || 1);
    this.lineSize = (o.horizontal ? o.itemW : o.itemH) + o.gap;
    var axis = o.horizontal ? o.viewportW : o.viewportH;
    this.fullLines = Math.max(1, Math.floor((axis + o.gap) / this.lineSize));
    this.visLines = Math.max(this.fullLines, Math.ceil(axis / this.lineSize));
    this.focus = new Focus(o.count, o.horizontal ? Math.max(1, o.count) : this.cross);
    this.layer = this.doc.createElement('div');
    this.layer.className = 'vlayer';
    this.layer.style.position = 'absolute';
    this.layer.style.left = '0px';
    this.layer.style.top = '0px';
    o.container.appendChild(this.layer);
    var n = (this.visLines + 2 * this.margin) * this.cross;
    for (var k = 0; k < n; k++) this.free.push(this.makeTile());
  }

  private makeTile(): Tile {
    var el = this.doc.createElement('div'), img = this.doc.createElement('img'), label = this.doc.createElement('span');
    el.className = 'vtile';
    el.style.position = 'absolute';
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.width = this.o.itemW + 'px';
    el.style.height = this.o.itemH + 'px';
    img.className = 'vimg';
    label.className = 'vlabel';
    el.appendChild(img);
    el.appendChild(label);
    return { el: el, img: img, label: label, bar: null, badge: null, index: -1, src: false };
  }

  get count(): number { return this.o.count; }

  setCount(count: number): void {
    this.o.count = count;
    this.focus.setCount(count);
    if (this.o.horizontal) this.focus.cols = Math.max(1, count);
    // Les tuiles déjà posées gardent leur index : sans relier, un même nombre d'éléments ne redessinerait rien.
    for (var k in this.active) this.bind(this.active[k]);
    this.scrollToFocus();
    this.update();
  }

  // Les données ont changé (page arrivée, contenu remplacé) : relie les tuiles actives.
  refresh(): void {
    for (var k in this.active) this.bind(this.active[k]);
    this.update();
  }

  // Page échouée : elle pourra être redemandée.
  pageFailed(start: number): void {
    if (this.o.pageSize) delete this.requested[Math.floor(start / this.o.pageSize)];
  }

  // Contenu remplacé (autre tri, autre filtre) : vide, retour en haut, toutes les pages pourront être redemandées.
  reset(): void {
    this.requested = {};
    this.focus.index = 0;
    this.top = 0;
    this.setCount(0);
  }

  // Écran recouvert ou quitté : retire les images décodées des tuiles actives (les nœuds restent, sans src).
  release(): void {
    this.held = true;
    for (var k in this.active) {
      var t = this.active[k];
      if (t.src) { t.img.removeAttribute('src'); t.src = false; }
    }
  }

  // L'écran redevient visible : les images des lignes visibles reviennent.
  restore(): void {
    this.held = false;
    this.update();
  }

  // Rend ou retire l'anneau de focus ; la sélection est conservée pour quand la liste redevient active.
  setActive(on: boolean): void {
    if (this.on === on) return;
    this.on = on;
    this.update();
  }

  setFocus(index: number): void {
    this.focus.index = Math.max(0, Math.min(index, this.o.count - 1));
    this.scrollToFocus();
    this.update();
  }

  // Saut (barre alphabétique) : la ligne de l'élément passe en haut de la fenêtre, les pages voisines sont demandées.
  jumpTo(index: number): void {
    this.focus.index = Math.max(0, Math.min(index, this.o.count - 1));
    this.top = Math.max(0, Math.min(Math.floor(this.focus.index / this.cross), this.totalLines() - this.fullLines));
    this.update();
  }

  // false : le focus n'a pas bougé (bord) ; l'appelant peut passer la main à la rangée voisine.
  handleKey(key: Key): boolean {
    if (key === 'enter') { if (this.o.onSelect && this.o.count > 0) this.o.onSelect(this.focus.index); return true; }
    if (key !== 'left' && key !== 'right' && key !== 'up' && key !== 'down') return false;
    if (!this.focus.move(key)) return false;
    this.scrollToFocus();
    this.update();
    return true;
  }

  private totalLines(): number { return Math.ceil(this.o.count / this.cross); }

  private scrollToFocus(): void {
    var line = Math.floor(this.focus.index / this.cross), t = this.top;
    if (line < t) t = line;
    else if (line > t + this.fullLines - 1) t = line - this.fullLines + 1;
    this.top = Math.max(0, Math.min(t, this.totalLines() - this.fullLines));
  }

  private bind(t: Tile): void {
    var info = this.o.render(t.index);
    t.label.textContent = info && info.title ? info.title : '';
    var url = info && info.image ? info.image : null;
    // src n'est retiré que si l'URL change : une page qui arrive ne redécode pas les affiches inchangées.
    if (t.src && url !== t.img.getAttribute('data-src')) { t.img.removeAttribute('src'); t.src = false; }
    t.img.setAttribute('data-src', url || '');
    if (info && info.selected) t.el.classList.add('sel'); else t.el.classList.remove('sel');
    if (info && info.done) t.el.classList.add('done'); else t.el.classList.remove('done');
    if (info && info.progress !== undefined) {   // barre créée à la demande : les grilles d'affiches n'en portent pas
      if (!t.bar) { t.bar = this.doc.createElement('span'); t.bar.className = 'vbar'; t.el.appendChild(t.bar); }
      t.bar.style.transform = 'scaleX(' + info.progress + ')';
    } else if (t.bar) { t.el.removeChild(t.bar); t.bar = null; }
    var b = info && info.badge;
    if (b) {
      if (!t.badge) { t.badge = this.doc.createElement('span'); t.el.appendChild(t.badge); }
      t.badge.className = 'vbadge ' + b.cls;
      t.badge.textContent = b.text;
    } else if (t.badge) { t.el.removeChild(t.badge); t.badge = null; }
  }

  private place(t: Tile, i: number): void {
    var line = Math.floor(i / this.cross), pos = i % this.cross, s = this.lineSize;
    var x = this.o.horizontal ? line * s : pos * (this.o.itemW + this.o.gap);
    var y = this.o.horizontal ? 0 : line * s;
    t.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
  }

  update(): void {
    var o = this.o, cross = this.cross, total = this.totalLines();
    var first = Math.max(0, this.top - this.margin);
    var last = Math.min(total - 1, this.top + this.visLines - 1 + this.margin);
    var lo = first * cross, hi = Math.min(o.count - 1, (last + 1) * cross - 1);
    var k: any, t: Tile;
    for (k in this.active) {
      t = this.active[k];
      if (t.index < lo || t.index > hi) {
        this.layer.removeChild(t.el);
        if (t.src) { t.img.removeAttribute('src'); t.src = false; }
        t.index = -1;
        delete this.active[k];
        this.free.push(t);
      }
    }
    // Images : lignes visibles (partielles comprises) + une ligne de marge au-dessus et en dessous.
    var loadHi = (this.top + this.visLines + this.margin) * cross - 1;
    for (var i = lo; i <= hi; i++) {
      t = this.active[i];
      if (!t) {
        t = this.free.pop()!;
        t.index = i;
        this.active[i] = t;
        this.place(t, i);
        this.bind(t);
        this.layer.appendChild(t.el);
      }
      if (!t.src && !this.held && i <= loadHi) {
        var url = t.img.getAttribute('data-src');
        if (url) { t.img.setAttribute('src', url); t.src = true; }
      }
      var sel = i === this.focus.index;
      if (sel && this.on) t.el.classList.add('focus'); else t.el.classList.remove('focus');
      if (sel && !this.on) t.el.classList.add('mark'); else t.el.classList.remove('mark');
    }
    var more = this.top + this.fullLines < total;
    if (o.edge && more !== this.more) { this.more = more; if (more) o.edge.classList.add('shown'); else o.edge.classList.remove('shown'); }
    var off = this.top * this.lineSize;
    this.layer.style.transform = o.horizontal ? 'translate3d(' + -off + 'px,0,0)' : 'translate3d(0,' + -off + 'px,0)';
    this.requestPages(lo, Math.min(o.count - 1, (last + 1 + (o.prefetchLines === undefined ? 2 : o.prefetchLines)) * cross - 1));
  }

  private requestPages(lo: number, hi: number): void {
    var ps = this.o.pageSize;
    if (!ps || !this.o.onPage || this.o.count === 0) return;
    for (var p = Math.floor(lo / ps); p <= Math.floor(hi / ps); p++) {
      if (this.requested[p]) continue;
      this.requested[p] = true;
      this.o.onPage(p * ps, Math.min(ps, this.o.count - p * ps));
    }
  }
}

export function createGrid(o: VirtualOptions): VirtualList { o.horizontal = false; return new VirtualList(o); }
export function createRow(o: VirtualOptions): VirtualList { o.horizontal = true; o.cols = 1; return new VirtualList(o); }
