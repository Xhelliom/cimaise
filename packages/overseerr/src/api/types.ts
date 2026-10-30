// Types de l'API Overseerr (v1). Formes vérifiées contre la vraie instance (1.33.2) par scripts/overseerr/verify.mjs et
// contre sa doc OpenAPI (/api-docs) pour POST /request, jamais appelé en réel (docs/decisions.md).
export interface HttpRequest { method: string; url: string; headers: { [k: string]: string }; body?: string; timeoutMs?: number; }
export interface HttpResponse { status: number; body: string; }
export interface Abortable { abort(): void; }
// Transport injectable (XHR sur la TV, faux dans les tests). Rappel à la Node : (erreur, réponse).
export type Http = (req: HttpRequest, cb: (err: Error | null, res?: HttpResponse) => void) => Abortable;

// language : code ISO 639-1 transmis à TMDB par Overseerr (titres et résumés traduits), facultatif.
export interface OverseerrConfig { url: string; key: string; language?: string; }

// config : URL ou clé absente ; unauthorized : clé refusée (401, ou 403 en lecture) ; forbidden : 403 sur une demande (droit ou quota) ;
// exists : 409 (demande déjà faite) ; invalid : 400 (paramètre refusé) ; unreachable : réseau, TLS ou délai ; format : JSON illisible.
export interface OverseerrError extends Error {
  code: 'config' | 'unauthorized' | 'forbidden' | 'exists' | 'invalid' | 'http' | 'unreachable' | 'format';
  status?: number;
}
export type Callback<T> = (err: OverseerrError | null, value?: T) => void;

// mediaInfo.status : 1 inconnu, 2 en attente d'approbation, 3 demandé (approuvé, en cours), 4 partiellement disponible, 5 disponible.
// Absent : jamais demandé ni présent dans le serveur multimédia.
export type Availability = 'none' | 'pending' | 'processing' | 'partial' | 'available';
export type MediaType = 'movie' | 'tv';

// Titre normalisé (film ou série) : ce que l'écran affiche, sans les ~25 champs de mediaInfo. id = identifiant TMDB.
export interface Title {
  id: number; mediaType: MediaType; title: string; year: number | null; posterPath: string | null; overview: string;
  availability: Availability;
}
// Page TMDB relayée par Overseerr : page commence à 1. Les personnes (recherche, tendances) sont retirées de items,
// donc items.length peut être < 20 sans que ce soit la dernière page. Deux pages voisines peuvent répéter des titres
// (doublons de TMDB, 2 à 4 par page le 30/10) : fusionner avec appendTitles.
export interface TitlePage { items: Title[]; page: number; totalPages: number; totalResults: number; }

// Réponse 201 de POST /request (schéma MediaRequest) : status 1 en attente, 2 approuvée, 3 refusée.
export interface RequestResult { id: number; status: number; availability: Availability; }

// Résultat du bouton « Tester » : version lue sans clé, nombre de médias lu avec la clé (null si absent).
export interface ConnectionInfo { version: string; mediaItems: number | null; }
