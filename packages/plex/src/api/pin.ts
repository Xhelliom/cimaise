import { Callback, Http, Identity, Timers } from './types';
import { requestJson } from './request';

var PINS = 'https://plex.tv/api/v2/pins';

export interface Pin { id: number; code: string; }
export type PinResult = { status: 'token'; token: string } | { status: 'expired' } | { status: 'error'; message: string };

// strong=false : code court à saisir sur plex.tv/link.
export function createPin(http: Http, id: Identity, cb: Callback<Pin>) {
  return requestJson(http, id, 'POST', PINS + '?strong=false', undefined, null, function (err, j) {
    if (err) return cb(err);
    cb(null, { id: j.id, code: j.code });
  });
}

// Interroge le PIN toutes les intervalMs jusqu'au jeton ou au délai ; renvoie la fonction d'annulation
// (idempotente : efface la minuterie, abandonne la requête en vol, plus aucun rappel).
export function pollPin(http: Http, id: Identity, pinId: number, timers: Timers,
  opts: { intervalMs: number; timeoutMs: number }, cb: (r: PinResult) => void): () => void {
  var cancelled = false, finished = false, timer: any = null, inflight: { abort(): void } | null = null;
  var deadline = timers.now() + opts.timeoutMs;

  function finish(r: PinResult) { if (cancelled || finished) return; finished = true; cb(r); }
  function schedule() {
    timer = timers.setTimeout(tick, opts.intervalMs);
  }
  function tick() {
    timer = null;
    if (cancelled) return;
    if (timers.now() >= deadline) return finish({ status: 'expired' });
    inflight = requestJson(http, id, 'GET', PINS + '/' + pinId, undefined, null, function (err, j) {
      inflight = null;
      if (cancelled) return;
      if (err && err.status === 404) return finish({ status: 'expired' });
      if (!err && j && j.authToken) return finish({ status: 'token', token: j.authToken });
      // erreur réseau passagère ou jeton pas encore là : on continue jusqu'au délai
      if (timers.now() + opts.intervalMs > deadline) return finish({ status: 'expired' });
      schedule();
    });
  }
  schedule();
  return function cancel() {
    cancelled = true;
    if (timer !== null) { timers.clearTimeout(timer); timer = null; }
    if (inflight) { inflight.abort(); inflight = null; }
  };
}
