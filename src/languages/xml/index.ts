import * as vscode from 'vscode';

import * as AssetsSymbolProvider from './assetsSymbolProvider';
import { OutlineSymbolProvider } from './outline';
import * as decorations from './decorations';
import { AssetsActionProvider } from './diagnostics';
import { registerFolding } from './folding';
import { registerFormatter } from './formatter';
import { registerAutoClosing } from './autoClosing';
import * as autoComplete from './autoComplete';
import * as analyzer from './analyzer';

export function activate(context: vscode.ExtensionContext) {
  decorations.activate(context);
  context.subscriptions.push(
    vscode.Disposable.from(
      ...OutlineSymbolProvider.register(context),
      ...AssetsActionProvider.register(context),
      registerFolding('anno-xml'),
      registerFormatter('anno-xml'),
      registerAutoClosing(context),
      autoComplete.activate())
  );

  AssetsSymbolProvider.activate(context);
  analyzer.activate(context);
}
