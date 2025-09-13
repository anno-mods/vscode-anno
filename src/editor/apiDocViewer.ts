import * as path from 'path';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  return vscode.commands.registerCommand('anno-modding-tools.openModloaderReference', () => {
    const panel = vscode.window.createWebviewPanel(
      'anno.api',
      'Modloader Reference',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    panel.iconPath = vscode.Uri.file(
      path.join(context.extensionPath, 'images', 'reference.svg')
    );

    const url = 'https://jakobharder.github.io/anno-mod-loader';
    panel.webview.html = getHtml(url);
  });
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
