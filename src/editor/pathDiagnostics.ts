import * as path from 'path';
import * as vscode from 'vscode';

import * as anno from '../anno';

let pathDiag: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
  pathDiag = vscode.languages.createDiagnosticCollection('path-rules');
  context.subscriptions.push(pathDiag);

  scanEntireWorkspace();

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      scanEntireWorkspace();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles(async (e) => {
      await scanUris(e.files);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles(async (e) => {
      // Sub-files of moved folders are not tracked.
      // Re-run the entire workspace if more files have been removed than the event has.

      var count = 0;
      for (const r of e.files) {
        count += removeFiles(r.oldUri, pathDiag);
      }
      if (count === e.files.length) {
        const newUris = e.files.map(f => f.newUri);
        await scanUris(newUris);
      }
      else {
        await scanEntireWorkspace();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidDeleteFiles((e) => {
      for (const uri of e.files) {
        removeFiles(uri, pathDiag);
      }
    })
  );

  // modinfo.json changes
  vscode.workspace.onDidSaveTextDocument(document => {
    if ((document.languageId === 'json' || document.languageId === 'jsonc')
        && anno.isModinfoFile(document.fileName)) {
      scanEntireWorkspace();
    }
  });
}

async function scanEntireWorkspace() {
  const excludeGlobs = await getFilesExcludeGlob();
  const uris = await vscode.workspace.findFiles('**/*', excludeGlobs);
  await scanUris(uris);
}

async function scanUris(uris: readonly vscode.Uri[]) {
  anno.ModInfoCache.clear();

  for (const uri of uris) {
    if (uri.scheme !== 'file') {
      continue;
    }

    const diags = await computePathDiagnostics(uri);
    if (diags.length > 0) {
      pathDiag.set(uri, diags);
    }
    else {
      pathDiag.delete(uri);
    }
  }

  anno.ModInfoCache.clear();
}

async function computePathDiagnostics(uri: vscode.Uri): Promise<vscode.Diagnostic[]> {
  const issues: vscode.Diagnostic[] = [];

  const modRoot = anno.findModRoot(uri.fsPath);
  const relativePath = path.relative(modRoot, uri.fsPath).replace(/\\/g, '/');
  const modInfo = anno.ModInfoCache.read(modRoot);

  if (relativePath.startsWith('data/')) {
    if (/\s/.test(relativePath)) {
      issues.push(makePathDiagnostic(`Path contains spaces: \`${relativePath}\``, vscode.DiagnosticSeverity.Warning));
    }

    if (/[A-Z]/.test(relativePath)) {
      const severity = modInfo?.game === anno.GameVersion.Anno7 ? vscode.DiagnosticSeverity.Information : vscode.DiagnosticSeverity.Warning;
      issues.push(makePathDiagnostic(`Avoid uppercase characters in path: \`${relativePath}\``, severity));
    }

    if (uri.fsPath.endsWith('.lua') && relativePath.startsWith('ubi/')) {
      var creatorName = modInfo ? modInfo.id.split('-').slice(-1)[0] : undefined;
      if (creatorName !== 'ubi') {
        issues.push(makePathDiagnostic(`\`ubi/\` for scripts is prone to collisions. Use a more unique name.`,
          vscode.DiagnosticSeverity.Warning));
      }
    }

    if (relativePath.startsWith('data/modgraphics/') || relativePath.startsWith('data/base/modgraphics/')) {
      const severity = modInfo?.game === anno.GameVersion.Anno7 ? vscode.DiagnosticSeverity.Information : vscode.DiagnosticSeverity.Warning;
      issues.push(makePathDiagnostic(`\`modgraphics/\` is prone to collisions. Use a more unique name.`,
        severity));
    }
  }

  return issues;
}

function makePathDiagnostic(message: string, severity: vscode.DiagnosticSeverity): vscode.Diagnostic {
  const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
  const d = new vscode.Diagnostic(range, message, severity);
  d.source = 'path-rules';
  return d;
}

async function getFilesExcludeGlob(): Promise<string | undefined> {
  const cfg = vscode.workspace.getConfiguration('files');
  const excludes = cfg.get<Record<string, boolean>>('exclude') ?? {};
  const on = Object.entries(excludes).filter(([, v]) => v).map(([k]) => k);
  on.push("**/node_modules|**/.git");
  return on.join('|') + "";
}

function removeFiles(uri: vscode.Uri, diag: vscode.DiagnosticCollection) {
  diag.delete(uri);

  if (uri.scheme !== 'file') {
    return 1;
  }

  const sep = path.sep;
  const ensureTrailingSep = (p: string) => (p.endsWith(sep) ? p : p + sep);
  const normalize = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p);

  // Using a trailing separator ensures we only match children, not siblings
  // with the same prefix (e.g., "/foo/bar" vs "/foo/barista").
  const prefix = normalize(ensureTrailingSep(uri.fsPath));

  const toDelete: vscode.Uri[] = [];
  diag.forEach((u /*, _diags */) => {
    if (u.scheme !== 'file') return;
    if (normalize(u.fsPath).startsWith(prefix)) {
      toDelete.push(u);
    }
  });

  toDelete.forEach(u => diag.delete(u));

  return toDelete.length;
}
