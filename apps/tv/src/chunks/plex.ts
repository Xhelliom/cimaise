import { createPlexPanel } from '../../../../packages/plex/src/panel';
import { createProbePanel } from '../../../../packages/plex/src/probe/panel';

(function (w: any) {
  (w.__cimaiseChunks || (w.__cimaiseChunks = {})).plex = { createPanel: createPlexPanel, createProbePanel: createProbePanel };
})(window);
