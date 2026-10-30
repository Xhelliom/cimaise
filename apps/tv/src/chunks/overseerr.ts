import { Panel } from '../../../../packages/tv-core/src/router/router';
import { loadStored } from '../../../../packages/tv-core/src/storage';
import { createOverseerrPanel, CSS } from '../../../../packages/overseerr/src/ui/home';
import { SEARCH_CSS } from '../../../../packages/overseerr/src/ui/search';
import { createOverseerrDetailPanel, DETAIL_CSS } from '../../../../packages/overseerr/src/ui/detail';
import { xhrHttp } from '../../../../packages/overseerr/src/api/xhr';
import { overseerrConfigFrom } from '../../../../packages/overseerr/src/api/config';
import { OverseerrConfig, Title } from '../../../../packages/overseerr/src/api/types';

// Chunk overseerr.js : injecté à la première ouverture de la tuile, jamais au démarrage. Son CSS (accueil, recherche, fiche)
// part avec lui. nav.push empile la recherche et la fiche au-dessus de l'accueil : Retour les dépile.
var styled = false;

// Titres et résumés en français (TMDB, via Overseerr) ; adresse et clé relues dans cimaise.v1 à chaque requête.
function config(): OverseerrConfig | null {
  var c = overseerrConfigFrom(loadStored().prefs);
  if (c) c.language = 'fr';
  return c;
}

function createPanel(arg?: { nav?: { push(p: Panel): void } }): Panel {
  if (!styled) {
    styled = true;
    var s = document.createElement('style');
    s.textContent = CSS + SEARCH_CSS + DETAIL_CSS;
    document.head.appendChild(s);
  }
  var push = arg && arg.nav ? arg.nav.push : undefined;
  return createOverseerrPanel({
    http: xhrHttp,
    push: push,
    config: config,
    onOpen: push ? function (t: Title) { push!(createOverseerrDetailPanel({ http: xhrHttp, config: config, title: t })); } : undefined
  });
}

(function (w: any) {
  (w.__cimaiseChunks || (w.__cimaiseChunks = {})).overseerr = { createPanel: createPanel };
})(window);
