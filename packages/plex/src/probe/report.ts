import { ProbeResult } from './run';

export var PROBE_KEY = 'cimaise.probe.v1';

var SHORT: { [s: string]: string } = { ok: 'OK', fail: 'KO', timeout: 'TO', none: '--' };

// Export lisible par l'orchestrateur : JSON compact (une entrée par catégorie), stocké sous PROBE_KEY.
export function toJson(results: ProbeResult[], at: number): string {
  var rows: any[] = [];
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    rows.push({ id: r.id, s: r.status, c: r.code, ms: r.ms, k: r.ratingKey, f: r.sample });
  }
  return JSON.stringify({ v: 1, at: at, results: rows });
}

export function saveProbe(results: ProbeResult[], at: number, store?: Storage): boolean {
  try { (store || window.localStorage).setItem(PROBE_KEY, toJson(results, at)); return true; } catch (e) { return false; }
}

// Affichage compact pour une photo : « id=OK » / « id=KO:code » / « id=TO » / « id=-- », une ligne de texte serrée.
export function compact(results: ProbeResult[]): string {
  var out: string[] = [];
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    out.push(r.id + '=' + SHORT[r.status] + (r.status === 'fail' ? ':' + r.code.replace(/^PLAYER_ERROR_/, '') : ''));
  }
  return out.join(' ');
}
