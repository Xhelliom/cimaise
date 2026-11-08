Issue : codé

## TV2 : lecture Plex en PLAYER_ERROR_INVALID_OPERATION

**Fait**
- Journal AVPlay dans le diagnostic (touche 0), affiché en tête (20 dernières lignes) : chaque appel, état avant→après,
  exception, URL sans hôte ni token. Rien en boucle (commits 8949104, c9a1b98).
- **Appel fautif identifié sur TV2** (photo de Stéphane) : `setSelectTrack AUDIO1 PLAYING ✗ TypeMismatchError#17:
  PLAYER_ERROR_INVALID_OPERATION`. `open`, `prepareAsync` et `play` réussissent. Tizen 4 refuse de resélectionner la piste
  audio déjà active (Longlegs : 1re piste par défaut) ; passer à une autre piste marche (Haunt, AUDIO2).
- **Pas le certificat** : la lecture démarre sous le certificat public Tizen ; la doc Samsung n'exige aucun privilège pour ces
  appels (seul drmplay, non utilisé).
- Correctif (3bb2b85) : piste active non resélectionnée (`getCurrentStreamInfo`), refus de piste non fatal (`onTrackError`,
  message dans la barre, la lecture continue), aucun appel de piste sur un lecteur fermé. 758 tests verts, `npm run check` OK.
- Vu par Stéphane : **Longlegs se lit sur TV2** ; **la Frame**, réinstallée (annoncée), **lit toujours un film et change de
  piste audio**.
- Consigné dans docs/tv-status.md (2513dda) : observé / réponse du SDK / non testé.

**Pas fait / à savoir**
- Le repli `<object type="application/avplayer">` (8949104), posé avant d'avoir le journal, ne s'est jamais déclenché. Il est
  inactif sauf en cas d'INVALID_OPERATION à l'ouverture ; on peut le retirer dans une carte ultérieure (réinstallation des
  deux TV à prévoir).
- Non testé sur TV2 : sous-titres externes, reprise (seekTo avant play), transcodage HLS, changement de piste manuel.
- `webapis.productinfo` renvoie SecurityError sur TV2 (privilège non déclaré, inutilisé par l'app) : sans effet.
