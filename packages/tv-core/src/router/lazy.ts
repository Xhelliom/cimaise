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
