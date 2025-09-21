import * as anno from '../../../anno';
import * as editor from '../../../editor';

import * as issues7 from './issues7.json';
import * as issues8 from './issues8.json';

export function issues(): IIssueDescription[] {
  return editor.ModContext.get().version === anno.GameVersion.Anno7 ? issues7 : issues8;
}

export interface IIssueDescription {
  matchWord?: string
  matchRegex?: string
  fix?: string
  fixMessage?: string
  code: string
  message: string
}
