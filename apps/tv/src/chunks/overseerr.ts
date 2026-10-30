import { Panel } from '../../../../packages/tv-core/src/router/router';
import { loadStored } from '../../../../packages/tv-core/src/storage';
import { createOverseerrPanel, CSS } from '../../../../packages/overseerr/src/ui/home';
import { SEARCH_CSS } from '../../../../packages/overseerr/src/ui/search';
import { xhrHttp } from '../../../../packages/overseerr/src/api/xhr';
import { overseerrConfigFrom } from '../../../../packages/overseerr/src/api/config';

// Chunk overseerr.js : injecté à la première ouverture de la tuile, jamais au démarrage. Son CSS (accueil et recherche) part avec lui.
// nav.push empile la recherche au-dessus de l'accueil : Retour la dépile et ramène à l'accueil Overseerr.
var styled = false;

function createPanel(arg?: { nav?: { push(p: Panel): void } }): Panel {
  if (!styled) {
    styled = true;
    var s = document.createElement('style');
    s.textContent = CSS + SEARCH_CSS;
    document.head.appendChild(s);
  }
  return createOverseerrPanel({
    http: xhrHttp,
    push: arg && arg.nav ? arg.nav.push : undefined,
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
