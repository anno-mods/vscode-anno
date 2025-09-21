import * as vscode from 'vscode';

import { GamePaths } from './gamePaths';
import * as modContext from './modContext';
import * as anno from '../anno';
import * as webViewer from './webViewer';

export const getModsFolder = GamePaths.getModsFolder;
export const ensureModsFolder = GamePaths.ensureModsFolder;
export const ensureGamePath = GamePaths.ensureGamePath;
export const isGamePathExtracted = GamePaths.isGamePathExtracted;

export const hasGamePath = GamePaths.hasGamePath;
export const getGamePathSetting = GamePaths.getGamePathSetting;
export const onDidChangeGamePath = GamePaths.onDidChangeGamePath;

export function activate(context: vscode.ExtensionContext): vscode.Disposable[] {
  return [ ...GamePaths.activate(context), ...webViewer.activate(context)];
}

export function isActive(): boolean {
  return modContext.get()?.version !== undefined && modContext.get()?.version !== anno.GameVersion.Auto;
}

export const ModContext = modContext;
