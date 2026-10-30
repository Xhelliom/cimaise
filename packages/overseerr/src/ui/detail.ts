import { Panel } from '../../../tv-core/src/router/router';
import { Key } from '../../../tv-core/src/keys';
import { Abortable, Availability, Http, OverseerrConfig, OverseerrError, RequestResult, Title } from '../api/types';
import { posterUrl } from '../api/media';
import { requestMedia } from '../api/client';
import { badgeFor, currentAvailability, rememberAvailability } from './badge';

// Fiche d'un film ou d'une série (maquette validée, packages/overseerr/mockups/fiche.html) : affiche, type et année, titre,
// badge, résumé, et « Demander » si le titre n'a jamais été demandé. Tout vient du Title déjà chargé par la rangée ou la
// recherche : aucune requête à l'ouverture. Affiche TMDB w300 (≈ 22 Ko, 300×450 décodé) étirée à 400×600, jamais plus grande.
// Teinte fixe indigo (Overseerr ne donne pas la couleur de l'affiche) : un dégradé statique, peint une fois.
export var DETAIL_CSS =
  '.ovd-tint{position:absolute;left:0;top:0;width:1920px;height:1080px;background:radial-gradient(ellipse 70% 80% at 18% 45%,rgba(49,46,129,.55),rgba(15,23,42,0) 70%)}' +
  '.ovd-af{position:absolute;left:120px;top:240px;width:400px;height:600px;border-radius:20px;background:#1e293b}' +
  '.ovd-af:not([src]){visibility:hidden}' +
  '.ovd-col{position:absolute;left:600px;top:252px;width:1160px}' +
  '.ovd-col .ov-sur{color:#94a3b8}' +
  '.ovd-h{margin:12px 0 24px;font-size:88px;font-weight:500;letter-spacing:-.02em;line-height:1;max-height:176px;overflow:hidden}' +
  '.ovd-b{display:inline-block;height:48px;padding:0 22px;border-radius:24px;font-size:26px;font-weight:500;line-height:48px}' +
  '.ovd-b.ok{background:#22c55e;color:#052e16}.ovd-b.dem{background:#6366f1;color:#fff}.ovd-b.att{background:#f59e0b;color:#1c1917}' +
  '.ovd-r{margin-top:36px;max-width:1060px;max-height:315px;overflow:hidden;font-size:32px;line-height:1.4;color:#cbd5e1}' +
  '.ovd-act{margin-top:56px;height:92px}' +
  '.ovd-btn{display:inline-block;vertical-align:middle;height:80px;padding:0 48px;border-radius:40px;font-size:32px;font-weight:500;line-height:80px;background:#6366f1;color:#fff;box-shadow:0 0 0 6px rgba(255,255,255,.92);transform:scale(1.05)}' +
  '.ovd-btn.busy{opacity:.6}' +
  '.ovd-note{display:inline-block;vertical-align:middle;font-size:28px;color:#94a3b8}' +
  '.ovd-btn+.ovd-note{margin-left:36px}.ovd-act.solo .ovd-note{margin-left:0}' +
  '.ovd-note.err{color:#fca5a5}';

export interface OverseerrDetailArg {
  http: Http;
  config: () => OverseerrConfig | null;
  title: Title;
  imageBase?: string;
  doc?: Document;
}

// État affiché sous le badge quand il n'y a rien à demander.
var NOTES: { [a: string]: string } = {
  available: 'Disponible dans Plex',
  partial: 'Partiellement disponible dans Plex',
  processing: 'Demandé, pas encore disponible',
  pending: 'Demande en attente de validation'
};

// Réponse 201 → badge. Le média renvoyé peut garder l'état d'avant l'approbation : le statut de la demande tranche
// (2 approuvée → Demandé, 1 en attente → En attente) sauf si le média est déjà (partiellement) disponible.
export function availabilityAfter(r: RequestResult): Availability {
  if (r.availability === 'available' || r.availability === 'partial') return r.availability;
  if (r.status === 2) return 'processing';
  if (r.status === 1) return 'pending';
  return r.availability;
}

// Message lisible d'un échec de demande ; la clé n'apparaît jamais (le client ne la met dans aucun message).
export function requestError(e: OverseerrError): string {
  switch (e.code) {
    case 'unauthorized': return 'Clé API refusée : la vérifier dans Réglages > Apps intégrées';
    case 'config': return 'Overseerr non configuré (Réglages > Apps intégrées)';
    case 'forbidden': return 'Demande refusée par Overseerr (droit ou quota)';
    case 'exists': return 'Déjà demandé';
    case 'unreachable': return 'Overseerr injoignable : réessayer';
    default: return 'Échec de la demande : ' + e.message;
  }
}

export function createOverseerrDetailPanel(arg: OverseerrDetailArg): Panel {
  var doc = arg.doc || document;
  var t = arg.title;
  function div(cls: string, text?: string): HTMLElement {
    var d = doc.createElement('div');
    d.className = cls;
    if (text) d.textContent = text;
    return d;
  }
  var root = div('ov ovd');
  root.appendChild(div('ovd-tint'));
  var head = div('ov-head');
  head.appendChild(div('ov-sur', 'Overseerr'));
  root.appendChild(head);
  var img = doc.createElement('img');
  img.className = 'ovd-af';
  var src = posterUrl(t.posterPath, 'w300', arg.imageBase);
  if (src) img.setAttribute('src', src);
  root.appendChild(img);
  var col = div('ovd-col');
  col.appendChild(div('ov-sur', (t.mediaType === 'movie' ? 'Film' : 'Série') + (t.year ? ' · ' + t.year : '')));
  col.appendChild(div('ovd-h', t.title));
  var badge = div('ovd-b');
  col.appendChild(badge);
  col.appendChild(div('ovd-r', t.overview || 'Pas de résumé.'));
  var act = div('ovd-act'), btn = div('ovd-btn', 'Demander'), note = div('ovd-note');
  act.appendChild(btn);
  act.appendChild(note);
  col.appendChild(act);
  root.appendChild(col);

  var req: Abortable | null = null;
  var msg = '', err = false;

  function paint(): void {
    var a = currentAvailability(t), b = badgeFor(a);
    badge.textContent = b ? b.text : '';
    badge.className = b ? 'ovd-b ' + b.cls : 'ovd-b';
    badge.style.display = b ? '' : 'none';
    var can = a === 'none';
    btn.style.display = can ? '' : 'none';
    act.className = can ? 'ovd-act' : 'ovd-act solo';
    btn.textContent = req ? 'Envoi…' : 'Demander';
    btn.className = req ? 'ovd-btn busy' : 'ovd-btn';
    note.className = err ? 'ovd-note err' : 'ovd-note';
    note.textContent = msg || (can ? (t.mediaType === 'tv' ? 'Toutes les saisons' : '') : NOTES[a] || '');
  }

  // Une demande à la fois ; une série est demandée en entier (seasons "all", dans requestMedia).
  function ask(): void {
    if (req || currentAvailability(t) !== 'none') return;
    msg = ''; err = false;
    req = requestMedia(arg.http, arg.config(), t.mediaType, t.id, function (e, r) {
      req = null;
      if (e || !r) {
        msg = e ? requestError(e) : 'Échec de la demande';
        err = !e || e.code !== 'exists';
        // 409 : une demande existe déjà ; le badge le dit, sans prétendre savoir si elle est approuvée.
        if (e && e.code === 'exists') rememberAvailability(t, 'processing');
      } else {
        var a = availabilityAfter(r);
        rememberAvailability(t, a);
        msg = r.status === 3 ? 'Demande refusée par Overseerr' : 'Demande envoyée' + (t.mediaType === 'tv' ? ' : toutes les saisons' : '');
        err = r.status === 3;
      }
      paint();
    });
    paint();
  }

  paint();

  return {
    el: root,
    onKey: function (k: Key): boolean {
      if (k === 'back') return false;   // le routeur dépile : retour à la rangée ou aux résultats, badge à jour
      if (k === 'enter') ask();
      return true;
    },
    suspend: function () { img.removeAttribute('src'); },
    resume: function () { if (src) img.setAttribute('src', src); },
    // Une demande partie n'est pas abandonnée : sa réponse met encore à jour le badge des rangées et de la recherche.
    destroy: function () { img.removeAttribute('src'); }
  };
}
