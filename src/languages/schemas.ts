import * as fs from 'fs';
import * as jsonc from 'jsonc-parser';
import * as path from 'path';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  vscode.workspace.onDidCreateFiles((e) => {
    for (const file of e.files) {
      if (path.basename(file.fsPath) === 'modinfo.json') {
        refreshFolderSchemas(file);
        break;
      }
    }
  });

  vscode.workspace.onDidRenameFiles((e) => {
    for (const file of e.files) {
      if (path.basename(file.newUri.fsPath) === 'modinfo.json') {
        refreshFolderSchemas(file.newUri);
        break;
      }
    }
  });

  refreshSchemas();
}

export function refreshSchemas() {
  if (!vscode.workspace.workspaceFolders) {
    return;
  }

  for (const folder of vscode.workspace.workspaceFolders) {
    refreshFolderSchemas(folder.uri);
  }
}

export function refreshFolderSchemas(scopeUri: vscode.Uri) {
  const config = vscode.workspace.getConfiguration('anno', scopeUri);
  const customXmlLanguageMode: boolean = config.get('workspaceCustomXmlLanguage') || true;
  const modopSchema: boolean = config.get('workspaceSchemas') || true;
  const modinfoSchema: boolean = config.get('workspaceSchemas') || true;

  if (customXmlLanguageMode || modopSchema || modinfoSchema) {
    writeWorkspaceSettings(customXmlLanguageMode, modopSchema, modinfoSchema, scopeUri);
  }
}

interface IJsonSchema {
  fileMatch: string[],
  url: string
}

interface IXmlSchema {
  pattern: string,
  systemId: string
}

async function writeWorkspaceSettings(languageMode: boolean, modopSchema: boolean,
  modinfoSchema: boolean, scopeUri: vscode.Uri) {

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(scopeUri);
  if (!workspaceFolder) {
    return;
  }

  const modinfoFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, '**/modinfo.json'),
    new vscode.RelativePattern(workspaceFolder, '**/node_modules/**'),
    1);
  if (modinfoFiles.length === 0) {
    return;
  }

  const folderPath = workspaceFolder.uri.fsPath;

  const vscodeDir = path.join(folderPath, '.vscode');
  const settingsPath = path.join(vscodeDir, 'settings.json');

  try {
    if (!fs.existsSync(vscodeDir)) {
      fs.mkdirSync(vscodeDir);
    }

    let settings: any = {};
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf8');
      settings = jsonc.parse(content);
    }

    let updateLanguage = true;
    let updateModopSchema = true;
    let updateModinfoSchema = true;

    if (languageMode) {
      settings['files.associations'] ??= {};

      if (settings['files.associations']['**/data/base/config/{engine,export,game,gui}/**/*.xml'] === 'anno-xml') {
        updateLanguage = false;
      }

      if (updateLanguage) {
        settings['files.associations']['**/data/base/config/{engine,export,game,gui}/**/*.xml'] = 'anno-xml';
      }
    }
    else {
      updateLanguage = false;
    }

    if (modopSchema) {
      const schemaUrl = "https://raw.githubusercontent.com/anno-mods/vscode-anno/main/generated/assets.xsd";

      settings['xml.fileAssociations'] ??= [];

      for (const entry of settings['xml.fileAssociations']) {
        if ((entry as IXmlSchema).systemId === schemaUrl) {
          updateModopSchema = false;
          break;
        }
      }

      if (updateModopSchema) {
        settings['xml.fileAssociations'].push({
          "pattern": "data/config/{engine,export,game,gui}/**/*.xml",
          "systemId": schemaUrl
        });
      }
    }
    else {
      updateModopSchema = false;
    }
    if (modinfoSchema) {
      settings['json.schemas'] ??= [];

      for (const entry of settings['json.schemas']) {
        if ((entry as IJsonSchema).fileMatch.includes('/modinfo.json')) {
          updateModinfoSchema = false;
          break;
        }
      }

      if (updateModinfoSchema) {
        (settings['json.schemas'] as any[]).push({
          "fileMatch": [ '/modinfo.json' ],
          "url": "https://raw.githubusercontent.com/anno-mods/vscode-anno/main/languages/modinfo-schema.json"
        });
      }
    }
    else {
      updateModinfoSchema = false;
    }

    if (updateLanguage || updateModinfoSchema || updateModopSchema) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    }
  }
  catch (err) {
    vscode.window.showWarningMessage(
      `Failed to update '.vscode/settings.json': ${err instanceof Error ? err.message : String(err)}`
    );
  }
}