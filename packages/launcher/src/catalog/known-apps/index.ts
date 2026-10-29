// Bibliothèque d'apps courantes : logo (known-apps/logos/, copié dans dist/logos/) et description d'une ligne.
// Rattachement par NOM d'app, jamais par ID (les IDs se relisent sur NOTRE TV). Provenance : THIRD_PARTY_NOTICES.md.
// Le logo n'est qu'une URL : il ne se charge qu'à l'affichage de la tuile (pas d'image dans le JS).
export interface KnownApp {
  logo: string;      // nom du fichier dans logos/
  names: string[];   // variantes de nom, déjà normalisées (voir nameKey)
  desc: string;
}
export interface KnownMatch extends KnownApp { logoUrl: string; }

export var LOGO_DIR = 'logos/';

export var KNOWN_APPS: KnownApp[] = [
  { logo: 'netflix.png', names: ['netflix'], desc: 'Séries, films et documentaires en streaming.' },
  { logo: 'youtube.png', names: ['youtube'], desc: 'Vidéos, chaînes et directs du monde entier.' },
  { logo: 'disney.png', names: ['disneyplus'], desc: 'Disney, Pixar, Marvel, Star Wars et National Geographic.' },
  { logo: 'canal.png', names: ['canalplus', 'mycanal'], desc: 'Cinéma, séries, sport et chaînes Canal+.' },
  { logo: 'prime.png', names: ['primevideo', 'amazonprimevideo', 'amazonprime'], desc: 'Films et séries inclus avec l’abonnement Amazon Prime.' },
  { logo: 'plex.png', names: ['plex', 'plexintegre'], desc: 'Ta médiathèque personnelle : films, séries et musique.' },
  { logo: 'molotov.png', names: ['molotov', 'molotovtv'], desc: 'La télé en direct et en replay, chaînes de la TNT et bouquets.' },
  { logo: 'arte.png', names: ['arte', 'artetv'], desc: 'Chaîne culturelle européenne : cinéma, documentaires et spectacles.' },
  { logo: 'francetv.png', names: ['francetv', 'francetelevisions'], desc: 'Direct et replay des chaînes de France Télévisions.' },
  { logo: 'tf1.png', names: ['tf1plus', 'tf1'], desc: 'TF1 en direct, replay et programmes exclusifs.' },
  { logo: 'm6.png', names: ['m6plus', 'm6', '6play'], desc: 'M6 en direct, replay, séries et émissions.' },
  { logo: 'spotify.png', names: ['spotify'], desc: 'Musique et podcasts à la demande.' },
  { logo: 'deezer.png', names: ['deezer'], desc: 'Musique en streaming, playlists et podcasts.' },
  { logo: 'twitch.png', names: ['twitch'], desc: 'Jeux vidéo et créateurs en direct.' },
  { logo: 'appletv.png', names: ['appletv', 'appletvplus'], desc: 'Séries et films Apple Originals, location et achat.' },
  { logo: 'pluto.png', names: ['plutotv'], desc: 'Chaînes gratuites en direct et vidéo à la demande.' },
  { logo: 'rakuten.png', names: ['rakutentv'], desc: 'Films et séries en location, avec des chaînes gratuites.' },
  { logo: 'max.png', names: ['max', 'hbomax', 'ocs'], desc: 'Séries HBO, films et programmes originaux.' },
  { logo: 'paramount.png', names: ['paramountplus'], desc: 'Films, séries et programmes Paramount, Nickelodeon et MTV.' },
  { logo: 'smarthub.png', names: ['smarthub', 'smarthubsamsung', 'modeart', 'artmode'], desc: 'Retour à l’accueil Samsung et au mode Art de la Frame.' }
];

// Mots qu'on ignore à la fin d'un nom (« Plex officiel », « Netflix App »).
var SUFFIXES = ['officiel', 'officielle', 'official', 'app', 'application'];

// Clé de comparaison : minuscules, sans accents, « + » lu « plus », ponctuation et espaces écartés.
export function nameKey(name: string): string {
  if (!name) return '';
  var t = name.toLowerCase();
  if ((t as any).normalize) t = (t as any).normalize('NFD').replace(/[̀-ͯ]/g, '');
  var words = t.replace(/\+/g, ' plus ').split(/[^a-z0-9]+/);
  var out: string[] = [];
  for (var i = 0; i < words.length; i++) if (words[i]) out.push(words[i]);
  while (out.length > 1 && SUFFIXES.indexOf(out[out.length - 1]) >= 0) out.pop();
  return out.join('');
}

// Fiche de l'app connue portant ce nom (ou une de ses variantes), sinon null.
export function knownApp(name: string | undefined): KnownMatch | null {
  var key = nameKey(name || '');
  if (!key) return null;
  for (var i = 0; i < KNOWN_APPS.length; i++) {
    if (KNOWN_APPS[i].names.indexOf(key) >= 0) {
      return { logo: KNOWN_APPS[i].logo, names: KNOWN_APPS[i].names, desc: KNOWN_APPS[i].desc, logoUrl: LOGO_DIR + KNOWN_APPS[i].logo };
    }
  }
  return null;
}
