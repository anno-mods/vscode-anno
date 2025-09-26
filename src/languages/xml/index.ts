import * as vscode from 'vscode';

import { AssetsSymbolProvider } from './outline';
import * as decorations from './decorations';
import { AssetsActionProvider } from './diagnostics';
import { registerFolding } from './folding';
import { registerFormatter } from './formatter';
import { registerAutoClosing } from './autoClosing';
import * as autoComplete from './autoComplete';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.Disposable.from(
      ...AssetsSymbolProvider.register(context),
      ...AssetsActionProvider.register(context),
      registerFolding('anno-xml'),
      registerFormatter('anno-xml'),
      registerAutoClosing(context),
      autoComplete.activate())
  );
  decorations.activate(context);
}
