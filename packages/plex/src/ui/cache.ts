// Cache local des métadonnées, avec durée de vie (HANDOFF §5.5). Une entrée par clé du Storage plus un petit index
// (ordre d'écriture, pour l'éviction) : écrire une page ne réécrit pas tout le cache. Isolé par serveur (`ns`).
// Frais (< ttl) : affiché sans requête. Périmé mais < staleMs : affiché tout de suite pendant la mise à jour.
export interface CacheOptions { store?: Storage; ns: string; now?: () => number; max?: number; staleMs?: number; }
export interface Cached<T> { value: T; fresh: boolean; }
export interface Cache {
  get<T>(key: string, ttlMs?: number): Cached<T> | null;
  set(key: string, value: any): void;
}

var IDX = 'cimaise.plex.idx';
var ENT = 'cimaise.plex.e.';
var DAY = 24 * 3600 * 1000;

interface Index { ns: string; keys: Array<[string, number]>; }

export function createCache(o: CacheOptions): Cache {
  var now = o.now || function () { return Date.now(); };
  var max = o.max || 120;
  var staleMs = o.staleMs === undefined ? DAY : o.staleMs;

  // L'espace de noms fait partie de la clé : une entrée d'un autre serveur n'est jamais relue.
  function full(k: string): string { return o.ns + '|' + k; }
  function store(): Storage { return o.store || window.localStorage; }
  function drop(fullKey: string): void { try { store().removeItem(ENT + fullKey); } catch (e) { /* rien à retirer */ } }

  // Relu à chaque accès : plusieurs écrans ont chacun leur cache sur le même Storage.
  function readIndex(): Index {
    var idx: Index | null = null;
    try { idx = JSON.parse(store().getItem(IDX) || 'null'); } catch (e) { idx = null; }
    if (idx && idx.ns === o.ns && idx.keys instanceof Array) return idx;
    if (idx && idx.keys instanceof Array) for (var i = 0; i < idx.keys.length; i++) drop(idx.keys[i][0]); // autre serveur
    return { ns: o.ns, keys: [] };
  }
  function writeIndex(idx: Index): void { try { store().setItem(IDX, JSON.stringify(idx)); } catch (e) { /* index perdu : au pire des entrées orphelines */ } }

  function evict(idx: Index, n: number): void {
    var gone = idx.keys.splice(0, n);
    for (var i = 0; i < gone.length; i++) drop(gone[i][0]);
  }

  return {
    get: function <T>(key: string, ttlMs?: number): Cached<T> | null {
      var txt: string | null = null, e: { t: number; v: T } | null = null, fk = full(key);
      try { txt = store().getItem(ENT + fk); e = txt === null ? null : JSON.parse(txt); } catch (err) { e = null; }
      if (!e || typeof e.t !== 'number') return null;
      var age = now() - e.t;
      if (age > staleMs) {
        drop(fk);
        var idx = readIndex();
        idx.keys = idx.keys.filter(function (k) { return k[0] !== fk; });
        writeIndex(idx);
        return null;
      }
      return { value: e.v, fresh: age <= (ttlMs === undefined ? 5 * 60000 : ttlMs) };
    },
    set: function (key: string, value: any): void {
      var idx = readIndex(), t = now(), fk = full(key);
      idx.keys = idx.keys.filter(function (k) { return k[0] !== fk; });
      idx.keys.push([fk, t]);
      if (idx.keys.length > max) evict(idx, idx.keys.length - max);
      var body = JSON.stringify({ t: t, v: value });
      try {
        store().setItem(ENT + fk, body);
      } catch (e1) {
        // Stockage plein : on libère la moitié la plus ancienne et on retente une fois.
        evict(idx, Math.ceil(idx.keys.length / 2));
        try { store().setItem(ENT + fk, body); } catch (e2) { idx.keys = idx.keys.filter(function (k) { return k[0] !== fk; }); }
      }
      writeIndex(idx);
    }
  };
}
