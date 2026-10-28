import { loadStored, saveStored } from '../../../tv-core/src/storage';
import { Identity } from './types';

export function plexHeaders(id: Identity, token?: string): { [k: string]: string } {
  var h: { [k: string]: string } = {
    'Accept': 'application/json',
    'X-Plex-Client-Identifier': id.clientId,
    'X-Plex-Product': id.product,
    'X-Plex-Version': id.version,
    'X-Plex-Platform': id.platform,
    'X-Plex-Device': id.device
  };
  if (token) h['X-Plex-Token'] = token;
  return h;
}

function uuid4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

// UUID généré une seule fois, conservé dans le stockage tv-core (prefs.plexClientId).
export function getClientId(store?: Storage): string {
  var s = loadStored(store);
  if (typeof s.prefs.plexClientId === 'string') return s.prefs.plexClientId;
  var id = uuid4();
  s.prefs.plexClientId = id;
  saveStored(s, store);
  return id;
}
