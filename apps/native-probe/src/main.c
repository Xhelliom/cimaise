/*
 * Sonde native « Voie B » (docs/home-button.md).
 * v1 (commit bf1a1a6) : fenêtre EFL + texte → chargement infini sur la Frame, texte jamais vu.
 * v2 (ici) : AUCUNE fenêtre. Le seul but est de savoir si ce code s'exécute : l'app démarre, reste
 * vivante DUREE_S secondes (visible dans tizen.application.getAppsContext côté lanceur web), puis
 * se ferme seule. Aucun appel vconf, aucun dlopen, aucun privilège, aucune écriture.
 */
#include <app.h>
#include <Ecore.h>

#define DUREE_S 60.0

static Eina_Bool
fermer(void *data)
{
	ui_app_exit();
	return ECORE_CALLBACK_CANCEL;
}

static bool
app_create(void *data)
{
	ecore_timer_add(DUREE_S, fermer, NULL);
	return true;
}

int
main(int argc, char *argv[])
{
	ui_app_lifecycle_callback_s cb = {0,};
	cb.create = app_create;
	return ui_app_main(argc, argv, &cb, NULL);
}
