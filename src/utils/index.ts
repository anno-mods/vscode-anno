import { findWord } from './text';

export { findWord };

export const removeNulls = <S>(value: S | null | undefined): value is S => value !== null && value !== undefined;

export function ensureArray(object: any) {
  if (Array.isArray(object)) {
    return object;
  }
  else {
    return [ object ];
  }
}
