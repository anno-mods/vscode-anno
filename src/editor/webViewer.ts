import * as path from 'path';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  return [
    vscode.commands.registerCommand('anno-modding-tools.openModloaderReference',
      (fileUri: vscode.Uri) => openReference(context, fileUri)),
    vscode.commands.registerCommand('anno-modding-tools.openModinfoReference',
      (fileUri: vscode.Uri) => openReference(context, fileUri)) ];
}

let currentPanel: vscode.WebviewPanel | undefined;

function getCurrentWord(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return undefined;
    }

    const position = editor.selection.active; // current cursor position
    const wordRange = editor.document.getWordRangeAtPosition(position);

    if (wordRange) {
        return editor.document.getText(wordRange);
    }

    return undefined;
}

function openReference(context: vscode.ExtensionContext, fileUri: vscode.Uri) {
  if (currentPanel) {
    currentPanel.reveal();
  }
  else {
    currentPanel = vscode.window.createWebviewPanel(
      'anno.api',
      'Modloader Reference',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    currentPanel.iconPath = vscode.Uri.file(
      path.join(context.extensionPath, 'images', 'reference.svg')
    );
  }

  const basename = fileUri ? path.basename(fileUri.path).toLowerCase() : undefined;
  const word = getCurrentWord()?.toLowerCase();

  var url = 'https://jakobharder.github.io/anno-mod-loader/';
  if (basename === 'modinfo.json' || basename === 'modinfo.jsonc') {
    url += "modinfo/";
  }
  else {
    if (word === 'modop') {
      url += "modops/basics/";
    }
    else if (word === 'add' || word === 'replace' || word === 'merge'
        || word === 'append' || word === 'prepend' || word === 'remove') {
      url += "modops/basics/#" + word;
    }
    else if (word === 'addnextsibling') {
        url += "modops/basics/#append";
    }
    else if (word === 'addprevsibling') {
        url += "modops/basics/#previous";
    }
    else if (word === 'group') {
      url += "modops/grouping/#groups";
    }
    else if (word === 'include') {
      url += "modops/grouping/#include-files";
    }
    else if (word === 'maxrepeat') {
      url += "modops/grouping/#loops";
    }
    else if (word === 'condition') {
      url += "modops/conditions/";
    }
  }

  currentPanel.webview.html = getHtml(url);

  currentPanel.onDidDispose(
    () => {
        currentPanel = undefined;
    },
    null,
    context.subscriptions
  );
}

function getHtml(url: string) {
  return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    http-equiv="Content-Security-Policy"
    content="
      default-src 'none';
      frame-src https://jakobharder.github.io https://*.github.io;
      img-src https:;
      style-src 'unsafe-inline' https:;
      font-src https:;
      connect-src https:;
    "
  >
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html, body, iframe {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
      border: 0;
      overflow: hidden; /* prevents double scrollbars */
    }
  </style>
</head>
<body>
  <iframe
    src="${url}"
    sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
    referrerpolicy="no-referrer"
  ></iframe>
</body>
</html>`;
}
