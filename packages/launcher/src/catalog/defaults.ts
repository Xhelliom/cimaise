import { CatalogEntry } from './model';

// Aucun ID d'app TV ici : ils se relisent sur NOTRE TV (HANDOFF §3, jalon M0).
var TODO = 'ID à relever en M0';

function tv(name: string, color: string): CatalogEntry {
  return { id: '', name: name, color: color, type: 'tv', todo: TODO };
}

export function defaultCatalog(): CatalogEntry[] {
  return [
    { id: 'plex', name: 'Plex intégré', color: '#e5a00d', type: 'interne' },
    tv('Plex officiel', '#3a3d42'),
    tv('Netflix', '#e50914'),
    tv('YouTube', '#c4302b'),
    tv('Disney+', '#113ccf'),
    tv('Canal+', '#2b2b2e'),
    tv('Smart Hub', '#5a5a5f')
  ];
}
