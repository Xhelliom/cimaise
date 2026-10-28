// Types de l'API Plex (HANDOFF §5.2). Formes écrites d'après les clients tiers : non vérifiées contre un vrai serveur.
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
export interface Server { name: string; accessToken: string; connections: Connection[]; }

export interface Section { key: string; title: string; type: string; }
export interface Part { id: number; key: string; duration?: number; }
export interface Media { id: number; container?: string; videoCodec?: string; audioCodec?: string; Part?: Part[]; }
export interface Item {
  ratingKey: string; title: string; type: string; thumb?: string; art?: string; summary?: string;
  duration?: number; viewOffset?: number; index?: number; leafCount?: number; viewedLeafCount?: number;
  Media?: Media[];
}
export interface Page { items: Item[]; total: number; offset: number; }
