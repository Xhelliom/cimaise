import { Http } from './ha';

// XMLHttpRequest (abort et timeout natifs, pas de Promise sur Tizen 5), comme le client Plex.
export var xhrHttp: Http = function (req, cb) {
  var x = new XMLHttpRequest(), done = false;
  x.open(req.method, req.url, true);
  for (var k in req.headers) if (req.headers.hasOwnProperty(k)) x.setRequestHeader(k, req.headers[k]);
  if (req.timeoutMs) x.timeout = req.timeoutMs;
  function end(err: Error | null) {
    if (done) return;
    done = true;
    if (err) cb(err); else cb(null, { status: x.status, body: x.responseText });
  }
  x.onload = function () { end(null); };
  x.onerror = function () { end(new Error('réseau')); };
  x.ontimeout = function () { end(new Error('délai dépassé')); };
  x.send(req.body);
  return { abort: function () { done = true; x.abort(); } };
};
