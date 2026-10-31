// Bibliothèque d'apps courantes : logo (known-apps/logos/, copié dans dist/logos/) et description d'une ligne.
// Rattachement par NOM d'app, jamais par ID (les IDs se relisent sur NOTRE TV). Provenance : THIRD_PARTY_NOTICES.md.
// Le logo est un logotype LARGE sur fond transparent, en UNE encre (`ink` : blanc ou noir, la plus lisible sur le fond) ; `bg` est la
// couleur forte de la marque : la tuile la prend, sans cadre. Sans logo (Smart Hub), la tuile porte le nom de l'app en blanc sur `bg`.
// Le logo n'est qu'une URL : il ne se charge qu'à l'affichage de la tuile (pas d'image dans le JS).
export interface KnownApp {
  logo?: string;     // nom du fichier dans logos/ ; absent : la tuile affiche le nom
  bg: string;        // fond de tuile : couleur de la marque
  ink?: string;      // encre du logo (#ffffff ou #000000) : le contraste avec bg est testé
  tag?: string;      // petite mention sous le logo (« officiel »)
  names: string[];   // alias de nom, déjà normalisés (voir nameKey) : égalité stricte de la clé
  starts?: string[]; // débuts de nom sûrs, en mots normalisés (« plex » : « Plex - Free Movies & TV ») ; après les égalités
  desc: string;
}
export interface KnownMatch extends KnownApp { logoUrl?: string; }

export var LOGO_DIR = 'logos/';

export var KNOWN_APPS: KnownApp[] = [
  { logo: 'netflix.png', bg: '#e50914', ink: '#ffffff', names: ['netflix'], starts: ['netflix'], desc: 'Séries, films et documentaires en streaming.' },
  { logo: 'youtube.png', bg: '#ff0000', ink: '#ffffff', names: ['youtube', 'youtubetv'], starts: ['youtube'], desc: 'Vidéos, chaînes et directs du monde entier.' },
  { logo: 'disney.png', bg: '#0e1a3d', ink: '#ffffff', names: ['disneyplus'], desc: 'Disney, Pixar, Marvel, Star Wars et National Geographic.' },
  { logo: 'canal.png', bg: '#000000', ink: '#ffffff', names: ['canalplus', 'mycanal'], desc: 'Cinéma, séries, sport et chaînes Canal+.' },
  { logo: 'prime.png', bg: '#00a8e1', ink: '#ffffff', names: ['primevideo', 'amazonprimevideo', 'amazonprime'], desc: 'Films et séries inclus avec l’abonnement Amazon Prime.' },
  { logo: 'plex-integre.png', bg: '#e5a00d', ink: '#000000', names: ['plexintegre'], desc: 'Ta médiathèque personnelle : films, séries et musique.' },
  { logo: 'plex.png', bg: '#000000', ink: '#ffffff', tag: 'officiel', names: ['plex', 'plexfreemoviestv', 'plexstreammoviestv', 'plexmoviestv'], starts: ['plex'], desc: 'L’app Plex d’origine, en secours quand un fichier ne passe pas.' },
  { logo: 'molotov.png', bg: '#fecf21', ink: '#000000', names: ['molotov', 'molotovtv'], desc: 'La télé en direct et en replay, chaînes de la TNT et bouquets.' },
  { logo: 'arte.png', bg: '#fa481c', ink: '#ffffff', names: ['arte', 'artetv'], desc: 'Chaîne culturelle européenne : cinéma, documentaires et spectacles.' },
  { logo: 'francetv.png', bg: '#0b1d6b', ink: '#ffffff', names: ['francetv', 'francetelevisions'], desc: 'Direct et replay des chaînes de France Télévisions.' },
  { logo: 'tf1.png', bg: '#02025a', ink: '#ffffff', names: ['tf1plus', 'tf1'], desc: 'TF1 en direct, replay et programmes exclusifs.' },
  { logo: 'm6.png', bg: '#161b2e', ink: '#ffffff', names: ['m6plus', 'm6', '6play'], desc: 'M6 en direct, replay, séries et émissions.' },
  { logo: 'spotify.png', bg: '#1ed760', ink: '#000000', names: ['spotify', 'spotifymusic'], starts: ['spotify'], desc: 'Musique et podcasts à la demande.' },
  { logo: 'deezer.png', bg: '#a238ff', ink: '#ffffff', names: ['deezer', 'deezermusic'], starts: ['deezer'], desc: 'Musique en streaming, playlists et podcasts.' },
  { logo: 'twitch.png', bg: '#9146ff', ink: '#ffffff', names: ['twitch'], starts: ['twitch'], desc: 'Jeux vidéo et créateurs en direct.' },
  { logo: 'appletv.png', bg: '#000000', ink: '#ffffff', names: ['appletv', 'appletvplus'], desc: 'Séries et films Apple Originals, location et achat.' },
  { logo: 'pluto.png', bg: '#fff200', ink: '#000000', names: ['plutotv'], desc: 'Chaînes gratuites en direct et vidéo à la demande.' },
  { logo: 'rakuten.png', bg: '#bf0000', ink: '#ffffff', names: ['rakutentv'], desc: 'Films et séries en location, avec des chaînes gratuites.' },
  { logo: 'max.png', bg: '#002be7', ink: '#ffffff', names: ['max', 'hbomax', 'ocs'], desc: 'Séries HBO, films et programmes originaux.' },
  { logo: 'paramount.png', bg: '#0064ff', ink: '#ffffff', names: ['paramountplus'], desc: 'Films, séries et programmes Paramount, Nickelodeon et MTV.' },
  { logo: 'overseerr.png', bg: '#4f65f5', ink: '#ffffff', names: ['overseerr'], desc: 'Demandes de films et séries à ajouter à la médiathèque Plex.' },
  { bg: '#1428a0', ink: '#ffffff', names: ['smarthub', 'smarthubsamsung', 'modeart', 'artmode'], desc: 'Retour à l’accueil Samsung et au mode Art de la Frame.' }
];

// Mots qu'on ignore à la fin d'un nom (« Plex officiel », « Netflix App »).
var SUFFIXES = ['officiel', 'officielle', 'official', 'app', 'application'];

// Mots d'un nom : NFKC (＆ pleine chasse → &, ligatures), minuscules, sans accents, « + » lu « plus », « & » lu « and »,
// ponctuation écartée.
function nameWords(name: string): string[] {
  if (!name) return [];
  var t = name;
  if ((t as any).normalize) t = (t as any).normalize('NFKC');
  t = t.toLowerCase();
  if ((t as any).normalize) t = (t as any).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  var words = t.replace(/\+/g, ' plus ').replace(/&/g, ' and ').split(/[^a-z0-9]+/);
  var out: string[] = [];
  for (var i = 0; i < words.length; i++) if (words[i]) out.push(words[i]);
  while (out.length > 1 && SUFFIXES.indexOf(out[out.length - 1]) >= 0) out.pop();
  return out;
}

// Clé de comparaison : les mots collés.
export function nameKey(name: string): string { return nameWords(name).join(''); }

// Position de l'app connue portant ce nom : alias exact d'abord, puis début de nom sûr ; -1 si aucune.
function knownIndex(name: string | undefined): number {
  var words = nameWords(name || '');
  if (!words.length) return -1;
  var key = words.join(''), i: number;
  for (i = 0; i < KNOWN_APPS.length; i++) if (KNOWN_APPS[i].names.indexOf(key) >= 0) return i;
  for (i = 0; i < KNOWN_APPS.length; i++) {
    var st = KNOWN_APPS[i].starts || [];
    for (var j = 0; j < st.length; j++) {
      var sw = st[j].split(' ');
      if (words.length > sw.length && words.slice(0, sw.length).join(' ') === st[j]) return i;
    }
  }
  return -1;
}

// Deux noms désignent-ils la même app ? Même clé, ou même fiche de la bibliothèque (alias, début de nom).
export function sameApp(a: string, b: string): boolean {
  var ka = nameKey(a);
  if (!ka) return false;
  if (ka === nameKey(b)) return true;
  var ia = knownIndex(a);
  return ia >= 0 && ia === knownIndex(b);
}

// Fiche de l'app connue portant ce nom (ou un de ses alias), sinon null.
export function knownApp(name: string | undefined): KnownMatch | null {
  var i = knownIndex(name);
  if (i < 0) return null;
  var a = KNOWN_APPS[i];
  return { logo: a.logo, bg: a.bg, ink: a.ink, tag: a.tag, names: a.names, starts: a.starts, desc: a.desc, logoUrl: a.logo ? LOGO_DIR + a.logo : undefined };
}
