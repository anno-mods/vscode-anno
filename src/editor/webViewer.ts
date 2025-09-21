import * as path from 'path';
import * as vscode from 'vscode';

import * as text from './text';
import { toUnicode } from 'punycode';

export function activate(context: vscode.ExtensionContext) {
  return [
    vscode.commands.registerCommand('anno-modding-tools.openModloaderReference',
      (fileUri: vscode.Uri) => openReference(context, fileUri)),
    vscode.commands.registerCommand('anno-modding-tools.openModinfoReference',
      (fileUri: vscode.Uri) => openReference(context, fileUri)) ];
}

let currentPanel: vscode.WebviewPanel | undefined;

function getCurrentNodeInfoLower() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
      return undefined;
  }

  const position = editor.selection.active;
  var info = text.getAutoCompletePath(editor.document, position);
  if (info) {
    info.path = info.path?.toLowerCase();
    info.tag = info.tag?.toLowerCase();
    info.word = info.word?.toLowerCase();
    info.attribute = info.attribute?.toLowerCase();
  }

  return info;
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

  var url = 'https://jakobharder.github.io/anno-mod-loader/';
  if (basename === 'modinfo.json' || basename === 'modinfo.jsonc') {
    url += "modinfo/";
  }
  else {
    const nodeInfo = getCurrentNodeInfoLower();

    // 5. what's the type for being within the attribute?. so after = inside the string

    if (nodeInfo?.attribute === 'condition' && (nodeInfo?.tag === 'modop'
        || nodeInfo?.tag === 'group' || nodeInfo?.tag === 'include'
        || (nodeInfo?.tag === 'asset' && nodeInfo?.path?.endsWith('/modops')))) {
      url += "modops/control/#condition";
    }
    else if (nodeInfo?.tag === 'modop') {
      if (nodeInfo.word === 'modop') {
        url += "modops/basics/";
      }
      else if (nodeInfo.word === 'add' || nodeInfo.word === 'replace' || nodeInfo.word === 'merge' || nodeInfo.word === 'remove') {
        url += "modops/basics/#" + nodeInfo.word;
      }
      else if (nodeInfo.word === 'addnextsibling' || nodeInfo.word === 'append') {
          url += "modops/basics/#append-addnextsibling";
      }
      else if (nodeInfo.word === 'addprevsibling' || nodeInfo.word === 'prepend') {
          url += "modops/basics/#prepend-addprevsibling";
      }
      else if (nodeInfo.word === 'content') {
        url += "modops/content/";
      }
      else if (nodeInfo.attribute === 'type') {
        url += "modops/basics/";
      }
      else if (nodeInfo.attribute === 'guid') {
        url += "modops/";
      }
    }
    else if (nodeInfo?.tag === 'group' && nodeInfo.isModOpLevel) {
      if (nodeInfo.attribute === 'maxrepeat') {
        url += "modops/control/#loop-condition";
      }
      else if (nodeInfo.type === 'attribute') {
        url += "modops/control/#group";
      }
    }
    else if (nodeInfo?.tag === 'include') {
      url += "modops/control/#include";
    }
    else if (nodeInfo?.tag === 'asset' && nodeInfo.isModOpLevel) {
      url += "modops/basics/#asset";
    }
    else if (nodeInfo?.tag === 'moditem') {
      url += "modops/lists/#moditem-merge"
    }
    else if ((nodeInfo?.tag === 'modvalue' && nodeInfo?.word === 'modvalue')
             || (nodeInfo?.tag === 'modopcontent' && nodeInfo.word === 'modopcontent')
             || (nodeInfo?.tag === 'modvaluecontent' && nodeInfo.word === 'modvaluecontent')) {
      if (nodeInfo?.tag === 'modvalue' && (nodeInfo?.attribute === 'merge' || nodeInfo?.attribute === 'remove')) {
        url += "modops/content/#merge-flags";
      }
      else if (nodeInfo?.tag === 'modvaluecontent' && nodeInfo?.attribute === 'skipparent') {
        url += "modops/lists/#skipparent";
      }
      else {
        url += "modops/content/";
      }
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
