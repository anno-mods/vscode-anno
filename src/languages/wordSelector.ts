import * as vscode from 'vscode';

export function activate(ctx: vscode.ExtensionContext) {
  const langConfigHandles = new Map<string, vscode.Disposable>();

  const applyFor = (doc: vscode.TextDocument) => {
    const lang = doc.languageId;

    const shouldEnable =
      (lang === 'plaintext' || lang === 'markdown' || lang === 'json' || lang === 'jsonc' || lang === 'xml' || lang === 'anno-xml');

    const hasHandle = langConfigHandles.has(lang);

    if (shouldEnable && !hasHandle) {
      // Allow '-' inside words
      const wordPattern =
        /(-?\d*\.\d\w*)|([^\s`~!@#%^&*()=+\[\]{}\\|;:'",.<>/?]+)/g;

      const handle = vscode.languages.setLanguageConfiguration(lang, { wordPattern });
      langConfigHandles.set(lang, handle);
    } else if (!shouldEnable && hasHandle) {
      langConfigHandles.get(lang)!.dispose();
      langConfigHandles.delete(lang);
    }
  };

  if (vscode.window.activeTextEditor) {
    applyFor(vscode.window.activeTextEditor.document);
  }

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(e => {
      if (e?.document) applyFor(e.document);
    }),
    vscode.workspace.onDidOpenTextDocument(doc => applyFor(doc)),
    { dispose: () => [...langConfigHandles.values()].forEach(d => d.dispose()) }
  );
}