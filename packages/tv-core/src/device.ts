import { noteIcon } from './diag';
// Seul point d'appel à tizen.* / webapis : tout le reste du code passe par ici.
export class DeviceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'DeviceError';
    // ES5 : le prototype n'est pas restauré par la sous-classe d'Error
    (Object as any).setPrototypeOf && (Object as any).setPrototypeOf(this, DeviceError.prototype);
  }
}

export function hasTizen(): boolean {
  return typeof (window as any).tizen !== 'undefined';
}

export function getTizen(): any {
  if (!hasTizen()) throw new DeviceError('NO_TIZEN', 'tizen est absent : pas de TV (aperçu navigateur ?)');
  return (window as any).tizen;
}

export function getWebapis(): any {
  var w = (window as any).webapis;
  if (typeof w === 'undefined') throw new DeviceError('NO_WEBAPIS', 'webapis est absent : pas de TV (aperçu navigateur ?)');
  return w;
}

export function registerKeys(names: string[]): void {
  var tizen = getTizen();
  for (var i = 0; i < names.length; i++) tizen.tvinputdevice.registerKey(names[i]);
}

// Quitte l'app (confirmation de sortie à la racine du routeur).
export function exitApp(): void {
  getTizen().application.getCurrentApplication().exit();
}

// Masque l'app et ramène à l'écran précédent de la TV (le Smart Hub quand l'app a été lancée depuis lui) ; l'app reste en mémoire.
export function hideApp(): void {
  getTizen().application.getCurrentApplication().hide();
}

// Suit l'état du réseau par événement (webapis.network, privilège network.public) : cb(true) = joignable, cb(false) = coupé.
// Appelle cb une fois avec l'état courant. Renvoie la fonction qui retire l'écoute. Hors TV : DeviceError NO_WEBAPIS.
export function watchNetwork(cb: (online: boolean) => void): () => void {
  var net = getWebapis().network;
  cb(!!net.isConnectedToGateway());
  var id = net.addNetworkStateChangeListener(function (state: number) {
    if (state === net.NetworkState.GATEWAY_DISCONNECTED) cb(false);
    else if (state === net.NetworkState.GATEWAY_CONNECTED) cb(true);
  });
  return function () { net.removeNetworkStateChangeListener(id); };
}

export interface InstalledApp { id: string; name: string; icon?: string; }

// Lance une app par son ID. Si `launch` échoue, repli sur launchAppControl (opération par défaut).
// Hors TV : DeviceError NO_TIZEN, jamais de succès simulé.
export function launchApp(id: string, onOk?: () => void, onErr?: (e: DeviceError) => void): void {
  var tizen = getTizen();
  if (!id) throw new DeviceError('NO_APP_ID', "launchApp : ID d'app vide");
  var fail = function (err: any) {
    if (onErr) onErr(new DeviceError('LAUNCH_FAILED', 'Lancement de ' + id + ' refusé : ' + (err && err.message ? err.message : 'erreur inconnue')));
  };
  var fallback = function () {
    try {
      var ctl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default');
      tizen.application.launchAppControl(ctl, id, function () { if (onOk) onOk(); }, fail);
    } catch (e) { fail(e); }
  };
  tizen.application.launch(id, function () { if (onOk) onOk(); }, fallback);
}

// Inventaire des apps installées visibles par l'utilisateur (champ `show` d'ApplicationInformation : exclut services
// et apps système), triées par nom. À appeler à la demande uniquement, jamais au démarrage.
export function listInstalledApps(onOk: (apps: InstalledApp[]) => void, onErr?: (e: DeviceError) => void): void {
  var tizen = getTizen();
  tizen.application.getAppsInfo(function (list: any[]) {
    var out: InstalledApp[] = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].show) noteIcon(list[i].name, list[i].iconPath);
      if (list[i].show) out.push({ id: list[i].id, name: list[i].name, icon: list[i].iconPath });
    }
    out.sort(function (a, b) {
      var x = String(a.name).toLowerCase(), y = String(b.name).toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
    onOk(out);
  }, function (err: any) {
    if (onErr) onErr(new DeviceError('LIST_FAILED', 'Inventaire des apps impossible : ' + (err && err.message ? err.message : 'erreur inconnue')));
  });
}
