import { Panel } from '../../../../packages/tv-core/src/router/router';
import { loadStored } from '../../../../packages/tv-core/src/storage';
import { createOverseerrPanel, CSS } from '../../../../packages/overseerr/src/ui/home';
import { xhrHttp } from '../../../../packages/overseerr/src/api/xhr';
import { overseerrConfigFrom } from '../../../../packages/overseerr/src/api/config';

// Chunk overseerr.js : injecté à la première ouverture de la tuile, jamais au démarrage. Son CSS part avec lui.
var styled = false;

function createPanel(): Panel {
  if (!styled) {
    styled = true;
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  return createOverseerrPanel({
    http: xhrHttp,
    // Titres et résumés en français (TMDB, via Overseerr) ; adresse et clé relues dans cimaise.v1 à chaque page.
    config: function () {
      var c = overseerrConfigFrom(loadStored().prefs);
      if (c) c.language = 'fr';
      return c;
    }
  });
}

(function (w: any) {
  (w.__cimaiseChunks || (w.__cimaiseChunks = {})).overseerr = { createPanel: createPanel };
})(window);
