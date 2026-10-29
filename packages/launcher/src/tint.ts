// Teinte du fond : deux calques plein écran, la couleur n'est écrite que sur le calque CACHÉ, puis seul son
// `opacity` change (fondu compositeur). Aucune transition sur color/background, aucun flou.
export interface Tint { set(rgb: string): void; }

export function createTint(parent: HTMLElement): Tint {
  var layers: HTMLElement[] = [];
  for (var i = 0; i < 2; i++) {
    var l = document.createElement('div');
    l.className = 'fond';
    parent.appendChild(l);
    layers.push(l);
  }
  var cur = 0;
  var timer: any = 0;
  return {
    set: function (rgb) {
      clearTimeout(timer);
      var next = layers[1 - cur], old = layers[cur];
      next.style.transition = 'none';
      next.className = 'fond';
      void next.offsetWidth;
      next.style.background = 'radial-gradient(ellipse 70% 60% at 32% 42%,rgba(' + rgb + ',.5),rgba(11,11,13,0) 75%)';
      next.style.zIndex = '2';
      old.style.zIndex = '1';
      void next.offsetWidth;
      next.style.transition = '';
      next.className = 'fond on';
      timer = setTimeout(function () { old.className = 'fond'; }, 650);
      cur = 1 - cur;
    }
  };
}
