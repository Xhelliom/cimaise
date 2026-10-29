export type Key = 'left' | 'right' | 'up' | 'down' | 'enter' | 'back' |
  'play' | 'pause' | 'playpause' | 'stop' | 'rewind' | 'forward';

// Codes Tizen / navigateur. Retour = 10009 sur la TV, Échap pour l'aperçu navigateur.
export var KEY_CODES: { [code: number]: Key } = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down',
  13: 'enter', 10009: 'back', 27: 'back',
  415: 'play', 19: 'pause', 10252: 'playpause', 413: 'stop', 412: 'rewind', 417: 'forward'
};

// Touches à enregistrer auprès de tvinputdevice (les flèches et Entrée sont livrées d'office).
export var REGISTER_KEYS = ['0', 'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaRewind', 'MediaFastForward'];

export function normalizeKey(e: { keyCode: number }): Key | null {
  var k = KEY_CODES[e.keyCode];
  return k === undefined ? null : k;
}
