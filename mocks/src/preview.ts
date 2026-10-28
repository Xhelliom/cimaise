// Coquille de l'aperçu : scène 1920×1080 mise à l'échelle, bascule 1280×720, télécommande clavier.
import { attach } from './remote';

const frame = document.getElementById('scene') as HTMLIFrameElement;
const hud = document.getElementById('hud') as HTMLElement;
let size = { w: 1920, h: 1080 };

function fit(): void {
  var s = Math.min(window.innerWidth / size.w, window.innerHeight / size.h);
  frame.style.width = size.w + 'px';
  frame.style.height = size.h + 'px';
  frame.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
  hud.textContent = size.w + '×' + size.h + ' · échelle ' + s.toFixed(2) + ' · ' + hud.getAttribute('data-key');
}

attach(window, frame, {
  hud: function (name) { hud.setAttribute('data-key', name); fit(); },
  reload: function () { frame.contentWindow!.location.reload(); },
  toggleSize: function () { size = size.w === 1920 ? { w: 1280, h: 720 } : { w: 1920, h: 1080 }; fit(); },
});
window.addEventListener('resize', fit);
hud.setAttribute('data-key', '—');
fit();
