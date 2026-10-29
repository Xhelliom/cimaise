// Chargement différé d'un module (Plex, réglages) : rappels plutôt que Promise, car la cible est ES5 sans polyfill.
// Le chargeur décide du transport : dans le bundle unique il appelle `done(init())` aussitôt (le gain est le
// coût d'initialisation, pas le réseau) ; pour un chunk séparé il injecte un <script> puis appelle `done`.
export interface Lazy<T> {
  loaded: boolean;
  get(ok: (mod: T) => void, fail?: (err: Error) => void): void;
}

export function lazy<T>(loader: (done: (mod: T) => void, fail: (err: Error) => void) => void): Lazy<T> {
  var mod: T | undefined;
  var loaded = false;
  var loading = false;
  var waiting: Array<{ ok: (m: T) => void; fail?: (e: Error) => void }> = [];

  var self: Lazy<T> = {
    loaded: false,
    get: function (ok, fail) {
      if (loaded) { ok(mod as T); return; }
      waiting.push({ ok: ok, fail: fail });
      if (loading) return;
      loading = true;
      loader(
        function (m) {
          mod = m; loaded = true; loading = false; self.loaded = true;
          var w = waiting; waiting = [];
          for (var i = 0; i < w.length; i++) w[i].ok(m);
        },
        function (err) {
          loading = false; // un nouvel appel retentera
          var w = waiting; waiting = [];
          for (var i = 0; i < w.length; i++) if (w[i].fail) (w[i].fail as (e: Error) => void)(err);
        }
      );
    }
  };
  return self;
}

// Chunk séparé : un second bundle ES5 (`<nom>.js`) qui s'enregistre dans window[CHUNKS][nom] en s'exécutant.
// Le script n'est injecté qu'au premier `get` : le JS initial ne contient rien du module.
export var CHUNKS = '__cimaiseChunks';

export function chunkLoader<T>(name: string): (done: (mod: T) => void, fail: (err: Error) => void) => void {
  return function (done, fail) {
    var w = window as any;
    var reg = w[CHUNKS] || (w[CHUNKS] = {});
    if (reg[name]) { done(reg[name]); return; }
    var s = document.createElement('script');
    s.onload = function () {
      if (reg[name]) done(reg[name]);
      else fail(new Error('chunk ' + name + ' : exécuté sans s\'enregistrer'));
    };
    s.onerror = function () { fail(new Error('chunk ' + name + ' : chargement impossible')); };
    s.src = name + '.js';
    document.head.appendChild(s);
  };
}
