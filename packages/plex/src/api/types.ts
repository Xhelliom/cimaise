// Types de l'API Plex (HANDOFF §5.2). Formes vérifiées contre un vrai serveur par scripts/plex/verify.mjs (docs/decisions.md).
export interface Identity { clientId: string; product: string; version: string; platform: string; device: string; }

export interface HttpRequest { method: string; url: string; headers: { [k: string]: string }; timeoutMs?: number; }
export interface HttpResponse { status: number; body: string; }
export interface Abortable { abort(): void; }
// Transport injectable (XHR sur la TV, faux dans les tests). Rappel à la Node : (erreur, réponse).
export type Http = (req: HttpRequest, cb: (err: Error | null, res?: HttpResponse) => void) => Abortable;
export type Callback<T> = (err: PlexError | null, value?: T) => void;

export interface PlexError extends Error { status?: number; }

// Horloge injectable pour le flux PIN.
export interface Timers {
  now(): number;
  setTimeout(fn: () => void, ms: number): any;
  clearTimeout(id: any): void;
}

export interface ServerRef { uri: string; token: string; }

export interface Connection { uri: string; local: boolean; relay: boolean; }
// owned : serveur du compte (false = partagé par un autre compte) ; plex.tv en liste plusieurs.
export interface Server { name: string; accessToken: string; owned: boolean; connections: Connection[]; }

export interface Section { key: string; title: string; type: string; }
export interface Part { id: number; key: string; duration?: number; }
export interface Media { id: number; container?: string; videoCodec?: string; audioCodec?: string; Part?: Part[]; }
export interface Item {
  ratingKey: string; title: string; type: string; thumb?: string; art?: string; summary?: string;
  duration?: number; viewOffset?: number; viewCount?: number; index?: number; leafCount?: number; viewedLeafCount?: number;
  year?: number;
  // Épisodes (onDeck, children) : série et saison parentes.
  grandparentTitle?: string; grandparentRatingKey?: string; grandparentThumb?: string; parentTitle?: string; parentIndex?: number;
  // Saisons (recentlyAdded) : série parente.
  parentRatingKey?: string; parentThumb?: string;
  Media?: Media[];
}
// Rayon de /hubs ; Metadata n'est présent que pour /hubs/sections/{id}.
export interface Hub { key: string; title: string; type: string; hubIdentifier: string; size: number; Metadata?: Item[]; }
export interface Page { items: Item[]; total: number; offset: number; }
