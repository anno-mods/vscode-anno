import * as vscode from 'vscode';

import * as diagnostics from './issues';
import * as life from './life';
import * as xml from '../../../anno/xml';
import * as utils from '../../../utils';

export class AssetsActionProvider {
  public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
    // subscribeToDocumentChanges(context, diagnostics);

    const selector: vscode.DocumentSelector = [
      { language: 'anno-xml', scheme: 'file' },
      { language: 'xml', scheme: 'file', pattern: xml.ASSETS_FILENAME_PATTERN }
    ];
    return [
      diagnostics.diagnosticsCollection,
      vscode.languages.registerCodeActionsProvider(selector, new AssetsCodeActionProvider(), {
        providedCodeActionKinds: AssetsCodeActionProvider.providedCodeActionKinds
      })
    ];
  }
}

export class AssetsCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix
  ];

  provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.CodeAction[] {
    return context.diagnostics
      .map(diagnostic => this.createCommandCodeAction(diagnostic, document))
      .filter(utils.removeNulls);
  }

  private createCommandCodeAction(diagnostic: vscode.Diagnostic, document: vscode.TextDocument): vscode.CodeAction | undefined {
    if (diagnostic.code === life.GAME_PATH_117) {
      const action = new vscode.CodeAction(`Open settings for \`${life.GAME_PATH_117}\``, vscode.CodeActionKind.QuickFix);
      action.command = {
        title: action.title,
        command: 'workbench.action.openSettings',
        arguments: [ life.GAME_PATH_117 ]
      };
      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      return action;
    }
    else {
      const issues = diagnostics.getIssues();
      for (var issue of issues) {
        if (issue.fix !== undefined && diagnostic.code === issue.code) {
          const action = new vscode.CodeAction(issue.fixMessage || 'Fix it', vscode.CodeActionKind.QuickFix);
          action.edit = new vscode.WorkspaceEdit();

          if (issue.matchRegex && issue.fix.indexOf('\\1') >= 0) {
            // regex use detected
            var newText = issue.fix;
            const issueText = document.getText(diagnostic.range);
            const match = issueText.match(new RegExp(issue.matchRegex));
            if (match) {
              for (var i = 1; i < (match?.length ?? 0); i++) {
                newText = newText.replace('\\' + i, match[i]);
              }
            }
            action.edit.replace(document.uri, diagnostic.range, newText);
          }
          else {
            action.edit.replace(document.uri, diagnostic.range, issue.fix);
          }
          action.diagnostics = [diagnostic];
          action.isPreferred = true;
          return action;
        }
      }
    }

    return undefined;
  }
}