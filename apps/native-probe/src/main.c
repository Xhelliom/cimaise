/*
 * Sonde native « Voie B », étape 1 (docs/home-button.md).
 * Ne fait RIEN d'autre que : ouvrir une fenêtre plein écran, afficher un texte, se fermer seule
 * après DUREE_S secondes. Aucun appel vconf, aucun dlopen, aucun privilège, aucune écriture.
 */
#include <app.h>
#include <Elementary.h>

#define DUREE_S 30.0

static Eina_Bool
fermer(void *data)
{
	ui_app_exit();
	return ECORE_CALLBACK_CANCEL;
}

static void
demande_fermeture(void *data, Evas_Object *obj, void *event_info)
{
	ui_app_exit();
}

static bool
app_create(void *data)
{
	Evas_Object *win, *fond, *texte;

	win = elm_win_util_standard_add("sondenative", "Sonde native");
	elm_win_autodel_set(win, EINA_TRUE);
	evas_object_smart_callback_add(win, "delete,request", demande_fermeture, NULL);

	fond = evas_object_rectangle_add(evas_object_evas_get(win));
	evas_object_color_set(fond, 20, 24, 32, 255);
	evas_object_size_hint_weight_set(fond, EVAS_HINT_EXPAND, EVAS_HINT_EXPAND);
	elm_win_resize_object_add(win, fond);
	evas_object_show(fond);

	texte = elm_label_add(win);
	elm_object_text_set(texte,
		"<align=center><font_size=64><color=#FFFFFF>cimaise — sonde native OK</color></font_size><br/>"
		"<font_size=36><color=#B0B8C8>App C (.tpk) signée avec le profil cimaise.<br/>"
		"Fermeture automatique dans 30 s.</color></font_size></align>");
	evas_object_size_hint_weight_set(texte, EVAS_HINT_EXPAND, EVAS_HINT_EXPAND);
	elm_win_resize_object_add(win, texte);
	evas_object_show(texte);

	evas_object_show(win);
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
