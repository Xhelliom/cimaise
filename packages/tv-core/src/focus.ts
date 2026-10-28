import { Key } from './keys';

// Modèle de focus pur sur une grille (cols = 1 pour une liste). Aucun accès au DOM :
// l'appelant ne déplace que transform/opacity en réponse à l'index.
export class Focus {
  index = 0;
  constructor(public count: number, public cols: number) {}

  setCount(count: number): void {
    this.count = count;
    if (this.index >= count) this.index = count > 0 ? count - 1 : 0;
  }

  // Renvoie true si le focus a bougé ; sinon l'appelant peut passer la main (ex. rangée voisine).
  move(dir: Key): boolean {
    var i = this.index, c = this.cols, n = this.count, next = i;
    if (n === 0) return false;
    if (dir === 'left') { if (i % c > 0) next = i - 1; }
    else if (dir === 'right') { if (i % c < c - 1 && i + 1 < n) next = i + 1; }
    else if (dir === 'up') { if (i - c >= 0) next = i - c; }
    else if (dir === 'down') {
      if (i + c < n) next = i + c;
      else if (Math.floor(i / c) < Math.floor((n - 1) / c)) next = n - 1; // dernière rangée incomplète
    }
    if (next === i) return false;
    this.index = next;
    return true;
  }
}
