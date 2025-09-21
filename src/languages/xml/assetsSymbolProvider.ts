import * as vscode from 'vscode';

import * as anno from '../../anno';
import * as rda from '../../data/rda';
import * as editorFormats from '../../editor/formats';
import * as modContext from '../../editor/modContext';
import * as xmltest from '../../tools/xmltest';
import { ASSETS_FILENAME_PATTERN, guidWithName, IAsset } from '../../utils/assetsXml';
import { SymbolRegistry } from '../../data/symbols';

const vanillaAssetContentProvider = new (class implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): string {

    const version = uri.scheme === 'annoasset8' ? anno.GameVersion.Anno8 : anno.GameVersion.Anno7;
    const vanillaPath = rda.getAssetsXml(version);
    if (!vanillaPath) {
      const msg = `assets.xml not found`;
      vscode.window.showErrorMessage(msg);
      throw msg;
    }

    const match = /(\d+)/g.exec(uri.fsPath);
    if (!match) {
      const msg = `GUID not found`;
      vscode.window.showErrorMessage(msg);
      throw msg;
    }
    const guid = match[0];

    return xmltest.show(guid, vanillaPath);
  }
})();

const infotipContentProvider = new (class implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): string {
    const version = uri.scheme === 'annoinfotip8' ? anno.GameVersion.Anno8 : anno.GameVersion.Anno7;
    const vanillaPath = rda.getPatchTarget('data/infotips/export.bin', version);
    if (!vanillaPath) {
      const msg = `InfoTips file 'export.bin' not found`;
      vscode.window.showErrorMessage(msg);
      throw msg;
    }

    const match = /(\d+)/g.exec(uri.fsPath);
    if (!match) {
      const msg = `GUID not found in InfoTips file`;
      vscode.window.showErrorMessage(msg);
      throw msg;
    }
    const guid = match[0];

    return xmltest.show(guid, vanillaPath);
  }
})();

function getLocationFromSymbol(symbol: IAsset) {
  if (symbol.location) {
    return new vscode.Location(symbol.location.filePath, new vscode.Position(symbol.location.line, 0));
  }
  else if (symbol.template === 'InfoTip') {
    const versionNumber = modContext.getVersion().toString();
    return new vscode.Location(vscode.Uri.from({ scheme: "annoinfotip" + versionNumber, path: guidWithName(symbol) }), new vscode.Position(0, 0));
  }
  else {
    const versionNumber = modContext.getVersion().toString();
    return new vscode.Location(vscode.Uri.from({ scheme: "annoasset" + versionNumber, path: guidWithName(symbol) }), new vscode.Position(0, 0));
  }
}

export class WorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  public async provideWorkspaceSymbols(search: string, token: vscode.CancellationToken): Promise<vscode.SymbolInformation[]> {
    if (!modContext.getVersion()) {
      return [];
    }

    const matchingSymbols = SymbolRegistry.all();
    let result: vscode.SymbolInformation[] = [];

    for (const [_, symbol] of matchingSymbols) {
      SymbolRegistry.resolveTemplate(symbol);

      result.push(
        new vscode.SymbolInformation(
          (symbol.english ?? symbol.name ?? symbol.guid) + (symbol.template ? ` (${symbol.template})` : ''),
          vscode.SymbolKind.Class,
          symbol.modName ?? 'vanilla',
          getLocationFromSymbol(symbol))
      );
    }

    return result;
  }
}

export class DefinitionProvider implements vscode.DefinitionProvider {
  public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
    if (!editorFormats.isAnnoXml(document)) {
      return;
    }

    const regex = /[-.:A-Z_a-z0-9]+/i;
    const word = document.getWordRangeAtPosition(position, regex);
    if (!word) {
      // not a valid word pattern
      return undefined;
    }
    const text = document.getText(word);

    const asset = SymbolRegistry.resolve(text);

    if (asset && asset.location) {
      return new vscode.Location(asset.location.filePath, new vscode.Position(asset.location.line, 0));
    }
    else if (asset) {
      return getLocationFromSymbol(asset);
    }

    return undefined;
  }
}

export function activate(context: vscode.ExtensionContext) {
    const selector: vscode.DocumentSelector = [
      { language: 'anno-xml', scheme: 'file' },
      { language: 'xml', scheme: 'file', pattern: ASSETS_FILENAME_PATTERN },
      { language: 'anno-xml', scheme: 'annoasset8' },
      { language: 'anno-xml', scheme: 'annoasset7' },
      { language: 'anno-xml', scheme: 'annodiff8' },
      { language: 'anno-xml', scheme: 'annodiff7' },
    ];

  context.subscriptions.push(
    vscode.Disposable.from(
      vscode.languages.registerWorkspaceSymbolProvider(
        new WorkspaceSymbolProvider())));
  context.subscriptions.push(
    vscode.Disposable.from(
      vscode.languages.registerDefinitionProvider(
        selector,
        new DefinitionProvider())));

  vscode.workspace.registerTextDocumentContentProvider("annoasset7", vanillaAssetContentProvider);
  vscode.workspace.registerTextDocumentContentProvider("annoasset8", vanillaAssetContentProvider);

  vscode.workspace.registerTextDocumentContentProvider("annoinfotip7", infotipContentProvider);
  vscode.workspace.registerTextDocumentContentProvider("annoinfotip8", infotipContentProvider);

  modContext.onCheckTextEditorContext(editor => {
    if (editor.document.uri.scheme.startsWith('annoasset')) {
      vscode.languages.setTextDocumentLanguage(editor.document, 'anno-xml');
      const version = editor.document.uri.scheme === 'annoasset8' ? anno.GameVersion.Anno8 : anno.GameVersion.Anno7;
      return new modContext.ModContext(editor?.document, version);
    }
  });
}
