import { createPlexPanel } from '../../../../packages/plex/src/panel';

(function (w: any) {
  (w.__cimaiseChunks || (w.__cimaiseChunks = {})).plex = { createPanel: createPlexPanel };
})(window);
