import { Http } from './ha';

// XMLHttpRequest (abort et timeout natifs, pas de Promise sur Tizen 5), comme le client Plex.
export var xhrHttp: Http = function (req, cb) {
  var x = new XMLHttpRequest(), done = false;
  x.open(req.method, req.url, !req.sync);
  for (var k in req.headers) if (req.headers.hasOwnProperty(k)) x.setRequestHeader(k, req.headers[k]);
  if (req.timeoutMs && !req.sync) x.timeout = req.timeoutMs;
  function end(err: Error | null) {
    if (done) return;
    done = true;
    if (err) cb(err); else cb(null, { status: x.status, body: x.responseText });
  }
  x.onload = function () { end(null); };
  x.onerror = function () { end(new Error('réseau')); };
  x.ontimeout = function () { end(new Error('délai dépassé')); };
  if (req.sync) { // synchrone : onload/onerror ne sont pas garantis, l'échec réseau lève
    try { x.send(req.body); } catch (e) { end(new Error('réseau')); return { abort: function () {} }; }
    end(null);
    return { abort: function () {} };
  }
  x.send(req.body);
  return { abort: function () { done = true; x.abort(); } };
};
