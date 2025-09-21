export function ensureArray(object: any) {
  if (Array.isArray(object)) {
    return object;
  }
  else {
    return [ object ];
  }
}
