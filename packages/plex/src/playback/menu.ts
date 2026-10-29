import { Stream } from '../api/types';
import { langLabel } from '../../../tv-core/src/langprefs';
import { ClientProfile, FRAME_2019_PROFILE, findEntry } from './profile';
import { normalizeLang } from './tracks';
import { PlaybackPlan } from './decide';

// Ligne du menu des pistes (touche Haut) : une piste audio, un sous-titre, ou « Sous-titres · Désactivés » (id null).
export interface TrackEntry { kind: 'audio' | 'subtitle'; id: number | null; label: string; current: boolean; stream: Stream | null; }

function lang(s: Stream): string { return langLabel(normalizeLang(s.languageCode)); }

// Libellés : langue, codec, « forcés », « externe » ; « incrustés » quand le format impose le transcodage (le transcodeur les grave dans l'image).
// Deux pistes au libellé identique sont numérotées.
export function trackEntries(plan: PlaybackPlan, profile?: ClientProfile): TrackEntry[] {
  var p = profile || FRAME_2019_PROFILE, all = plan.part.Stream || [], out: TrackEntry[] = [], i: number;
  var sub: TrackEntry[] = [{ kind: 'subtitle', id: null, label: 'Sous-titres · Désactivés', current: !plan.subtitle, stream: null }];
  for (i = 0; i < all.length; i++) {
    var s = all[i], label: string;
    if (s.streamType === 2) {
      label = 'Audio · ' + lang(s) + (s.codec ? ' · ' + s.codec.toUpperCase() : '');
      out.push({ kind: 'audio', id: s.id, label: label, current: !!plan.audio && plan.audio.id === s.id, stream: s });
    } else if (s.streamType === 3) {
      label = 'Sous-titres · ' + lang(s) + (s.codec ? ' · ' + s.codec.toUpperCase() : '') + (s.forced ? ' · forcés' : '') +
        (s.hearingImpaired ? ' · malentendants' : '') + (s.key ? ' · externe' : '') +
        (findEntry(s.key ? p.subtitles.external : p.subtitles.embedded, s.codec) ? '' : ' · incrustés');
      sub.push({ kind: 'subtitle', id: s.id, label: label, current: !!plan.subtitle && plan.subtitle.id === s.id, stream: s });
    }
  }
  out = out.concat(sub);
  var seen: { [l: string]: number } = {}, total: { [l: string]: number } = {};
  for (i = 0; i < out.length; i++) total[out[i].label] = (total[out[i].label] || 0) + 1;
  for (i = 0; i < out.length; i++) {
    var l = out[i].label;
    if (total[l] > 1) { seen[l] = (seen[l] || 0) + 1; out[i].label = l + ' · ' + seen[l]; }
  }
  return out;
}
