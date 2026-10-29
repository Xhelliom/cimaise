// Catalogue initial des tuiles. Pas d'ID d'app Tizen ici : ils se relisent sur NOTRE TV (HANDOFF §3) et
// le lancement des apps réelles est le jalon M2 ; une tuile sans `module` n'a donc pas encore d'action.
export interface Tile {
  name: string;
  letter: string;
  color: string;     // fond de la tuile
  ink: string;       // couleur de la lettre
  rgb: string;      // teinte du fond d'écran quand la tuile est focalisée, "r,g,b"
  module?: 'plex';   // module interne ouvert par la tuile
}

export var TILES: Tile[] = [
  { name: 'Plex intégré', letter: 'P', color: '#e5a00d', ink: '#1f1f1f', rgb: '229,160,13', module: 'plex' },
  { name: 'Plex', letter: 'P', color: '#3a3d42', ink: '#e5a00d', rgb: '75,80,87' },
  { name: 'Netflix', letter: 'N', color: '#e50914', ink: '#fff', rgb: '229,9,20' },
  { name: 'YouTube', letter: 'Y', color: '#c4302b', ink: '#fff', rgb: '214,32,31' },
  { name: 'Disney+', letter: 'D', color: '#113ccf', ink: '#fff', rgb: '17,60,207' },
  { name: 'Canal+', letter: 'C', color: '#2b2b2e', ink: '#fff', rgb: '90,90,95' }
];
