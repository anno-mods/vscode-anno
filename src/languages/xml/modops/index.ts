
import * as assets7 from './modops8.json';

export interface IModOpAttributeInfo {
  name: string
  requires?: string[]
  conflicts?: string[]
  insert?: string
  sort?: string
  values?: string[]
  autoSuggest?: boolean
  hidden?: boolean
}

export interface IModOpTagInfo {
  attributes: (string | IModOpAttributeInfo)[]
  code?: string
  url?: string
}

export function getTagInfos() {
  return assets7 as Record<string, IModOpTagInfo>;
}