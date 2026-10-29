import { Callback, HttpBinary, Identity, PlexError, ServerRef } from '../api/types';
import { plexHeaders } from '../api/identity';
import { assertPlexDirect } from './urls';

// Index de prévisualisation Plex (BIF) : en-tête de 64 octets (magic 89 'BIF' 0D 0A 1A 0A, version, nombre d'images, multiplicateur de
// temps en ms, 44 octets réservés), puis count+1 entrées {temps, offset} (la dernière : temps 0xFFFFFFFF, offset = fin des données).
// On ne garde que la table (8 octets par image) et le tampon d'origine ; les JPEG ne sont découpés qu'à la demande.
export interface Bif { buf: ArrayBuffer; count: number; mult: number; view: DataView; }

var MAGIC = [0x89, 0x42, 0x49, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];

export function parseBif(buf: ArrayBuffer): Bif | null {
  if (!buf || buf.byteLength < 64) return null;
  var v = new DataView(buf);
  for (var i = 0; i < MAGIC.length; i++) if (v.getUint8(i) !== MAGIC[i]) return null;
  var count = v.getUint32(12, true), mult = v.getUint32(16, true) || 1000;
  if (count < 1 || 64 + (count + 1) * 8 > buf.byteLength) return null;
  return { buf: buf, count: count, mult: mult, view: v };
}

function stampOf(b: Bif, i: number): number { return b.view.getUint32(64 + i * 8, true) * b.mult; }

// Image la plus proche de `ms` : { start, end } des octets JPEG dans le tampon ; null si l'entrée est incohérente.
export function bifFrameAt(b: Bif, ms: number): { start: number; end: number } | null {
  var lo = 0, hi = b.count - 1;
  while (lo < hi) {
    var mid = (lo + hi + 1) >> 1;
    if (stampOf(b, mid) <= ms) lo = mid; else hi = mid - 1;
  }
  if (lo + 1 < b.count && ms - stampOf(b, lo) > stampOf(b, lo + 1) - ms) lo++;
  var start = b.view.getUint32(64 + lo * 8 + 4, true), end = b.view.getUint32(64 + (lo + 1) * 8 + 4, true);
  return end > start && end <= b.buf.byteLength ? { start: start, end: end } : null;
}

export function bifFrameBytes(b: Bif, ms: number): ArrayBuffer | null {
  var f = bifFrameAt(b, ms);
  return f ? b.buf.slice(f.start, f.end) : null;
}

// La part annonce un index de prévisualisation (`indexes` : liste séparée par des virgules contenant « sd », ex. « sd,hd »).
// `hasThumbnail` n'est qu'une pochette intégrée au fichier. Sans index, seule l'heure visée est affichée.
export function hasPreviewIndex(part: { indexes?: string }): boolean {
  return typeof part.indexes === 'string' && part.indexes.split(',').some((i) => i.trim() === 'sd');
}

// Télécharge l'index « sd » de la part (même fichier pour la lecture directe et le transcodage). Retourne de quoi l'interrompre.
export function loadBif(http: HttpBinary, id: Identity, server: ServerRef, partId: number, cb: Callback<Bif>) {
  try { assertPlexDirect(server); } catch (e) { cb(e as Error); return null; }
  var h = plexHeaders(id, server.token);
  h['Accept'] = '*/*';
  return http({ method: 'GET', url: server.uri + '/library/parts/' + partId + '/indexes/sd', headers: h, timeoutMs: 30000 }, function (err, res) {
    if (err || !res) return cb(err || new Error('pas de réponse'));
    if (res.status < 200 || res.status >= 300) { var e = new Error('HTTP ' + res.status) as PlexError; e.status = res.status; return cb(e); }
    var b = parseBif(res.body);
    if (!b) return cb(new Error('index de prévisualisation invalide'));
    cb(null, b);
  });
}
