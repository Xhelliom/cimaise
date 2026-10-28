// Page vide de référence (HANDOFF §6 bis, étape 1) : fond uni, heure, horodatages de démarrage.
import { mark, report, toggleDiag, normalizeKey, hasTizen, registerKeys, REGISTER_KEYS } from '../../../packages/tv-core/src/index';

var clock = document.getElementById('clock')!;
var marks = document.getElementById('marks')!;

function pad(n: number): string { return n < 10 ? '0' + n : '' + n; }

// Horloge à la minute : seule minuterie active.
function tick(): void {
  var d = new Date();
  clock.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
  setTimeout(tick, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()));
}

tick();
mark('firstPaint');
if (hasTizen()) registerKeys(REGISTER_KEYS);

document.addEventListener('keydown', function (e) {
  var k = normalizeKey(e);
  if (k === 'enter') toggleDiag(); // écran de diagnostic caché : Entrée
});

mark('interactive');
marks.textContent = report();
