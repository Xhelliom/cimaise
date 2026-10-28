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
