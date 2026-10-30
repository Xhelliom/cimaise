import { createPlexPanel } from '../../../../packages/plex/src/panel';
import { createSettingsPanel } from '../../../../packages/plex/src/ui/settings';
import { createProbePanel } from '../../../../packages/plex/src/probe/panel';

(function (w: any) {
  (w.__cimaiseChunks || (w.__cimaiseChunks = {})).plex = { createPanel: createPlexPanel, createProbePanel: createProbePanel, createSettingsPanel: createSettingsPanel };
})(window);
