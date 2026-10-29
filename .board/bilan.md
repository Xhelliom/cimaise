# Bilan
Cause : `wants()` (packages/plex/src/ui/home.ts) ne gardait les images que pour la rangée active et la suivante. La rangée précédente, demi-cachée par le décalage vertical, était vidée (src retiré) ; elle revenait en remontant. Ce n'est pas le choix d'image d'épisode.
Corrigé : rangées active-1 à active+2 gardent leurs images (marge d'une rangée au-dessus et en dessous). VirtualList charge aussi la ligne de marge au-dessus (grilles).
Tests : accueil (rangée précédente/retour en haut) et virtual (marge haute) ; échouaient avant. npm run check passe (195).
Non fait : instrumentation TV (inutile, cause reproduite dans l'aperçu de test) ; à confirmer sur la Frame.
