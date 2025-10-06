import * as assets7 from './modops7.json';
import * as assets8 from './modops8.json';
import * as anno from '../../../anno';

export interface IModOpAttributeInfo {
  name: string
  requires?: string[]
  conflicts?: string[]
  insert?: string
  sort?: string
  values?: string[]
  autoSuggest?: boolean
  hidden?: boolean
  patchTypes?: string[]
}

export interface IModOpTagInfo {
  attributes: (string | IModOpAttributeInfo)[]
  code?: string
  url?: string
  patchTypes?: string[]
}

export function getTagInfos(gameVersion: anno.GameVersion) {
  if (gameVersion === anno.GameVersion.Anno8) {
    return assets8 as Record<string, IModOpTagInfo>;
  }
  else {
    return assets7 as Record<string, IModOpTagInfo>;
  }
}