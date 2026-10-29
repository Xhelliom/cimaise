import { Http, HttpBinary } from './types';

// XMLHttpRequest plutôt que fetch : sur le moteur web de Tizen 5 (Chromium ancien), fetch n'a ni AbortController
// ni délai d'expiration ; XHR offre abort() et timeout, et se passe de polyfill de Promise (cible ES5).
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
  x.send();
  return { abort: function () { done = true; x.abort(); } };
};

// Variante binaire (responseType arraybuffer) : l'index de prévisualisation se lit avec DataView, sans passer par une chaîne.
export var xhrBinary: HttpBinary = function (req, cb) {
  var x = new XMLHttpRequest(), done = false;
  x.open(req.method, req.url, true);
  x.responseType = 'arraybuffer';
  for (var k in req.headers) if (req.headers.hasOwnProperty(k)) x.setRequestHeader(k, req.headers[k]);
  if (req.timeoutMs) x.timeout = req.timeoutMs;
  function end(err: Error | null) {
    if (done) return;
    done = true;
    if (err) cb(err); else cb(null, { status: x.status, body: x.response as ArrayBuffer });
  }
  x.onload = function () { end(null); };
  x.onerror = function () { end(new Error('réseau')); };
  x.ontimeout = function () { end(new Error('délai dépassé')); };
  x.send();
  return { abort: function () { done = true; x.abort(); } };
};
