// Démo de l'aperçu navigateur : rangée de hubs + grille de 5000 tuiles factices, pagination simulée.
import { createGrid, createRow, VirtualList, normalizeKey } from '../src/index';

var PAGE = 50, TOTAL = 5000, loaded: { [i: number]: boolean } = {};
var $ = function (id: string): HTMLElement { return document.getElementById(id)!; };
var hud = $('hud');
var requests = 0;

function tile(prefix: string) {
  return function (i: number) {
    if (prefix === 'g' && !loaded[i]) return null;
    // SVG en data: = affiche factice sans réseau
    var hue = (i * 37) % 360;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="hsl(' + hue + ',45%,35%)"/></svg>';
    return { title: prefix + ' ' + i, image: 'data:image/svg+xml,' + encodeURIComponent(svg) };
  };
}

var row: VirtualList = createRow({
  container: $('row'), count: 40, itemW: 300, itemH: 170, gap: 20, viewportW: 1920, viewportH: 170, render: tile('h')
});
var grid: VirtualList = createGrid({
  container: $('grid'), count: TOTAL, cols: 6, itemW: 200, itemH: 300, gap: 20, viewportW: 1920, viewportH: 700,
  pageSize: PAGE, render: tile('g'),
  onPage: function (start, size) {
    requests++;
    setTimeout(function () { // latence réseau simulée
      for (var i = start; i < start + size; i++) loaded[i] = true;
      grid.refresh();
    }, 150);
  }
});
row.update();
grid.update();

var cur: VirtualList = grid;
function stat(): void {
  var n = document.querySelectorAll('.vtile').length;
  hud.textContent = 'tuiles DOM: ' + n + ' | focus: ' + cur.focus.index + ' | pages demandées: ' + requests + ' / ' + TOTAL / PAGE;
  $('row').className = cur === row ? 'on' : '';
  $('grid').className = cur === grid ? 'on' : '';
}
document.addEventListener('keydown', function (e) {
  var k = normalizeKey(e);
  if (!k) return;
  e.preventDefault();
  if (!cur.handleKey(k)) {
    if (k === 'up' && cur === grid) cur = row;
    else if (k === 'down' && cur === row) cur = grid;
  }
  stat();
});
stat();
