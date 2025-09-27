import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as xmldoc from 'xmldoc';

import * as versionChecks from '../versionChecks';
import * as anno from '../../../anno';
import * as xml from '../../../anno/xml';
import * as editor from '../../../editor';
import * as text from '../../../editor/text';
import * as utils from '../../../utils';
import * as editorFormats from '../../../editor/formats';

import * as issues7 from './issues7.json';
import * as issues8 from './issues8.json';
import { StaticAnalysis } from '../analyzer';
import * as modops from '../modops';

export function getIssues(): IIssueDescription[] {
  return editor.ModContext.get().version === anno.GameVersion.Anno7 ? issues7 : issues8;
}

export interface IIssueDescription {
  matchWord?: string
  matchRegex?: string
  fix?: string
  fixMessage?: string
  code: string
  message: string
}

const XML_DOUBLE_DASH = 'xml-double-dash-in-comment';
const XML_NESTED_COMMENT = 'xml-nested-comment';

export const diagnosticsCollection = vscode.languages.createDiagnosticCollection('anno-static');

function checkFileName(modPaths: string[], line: string, lineIndex: number, annoRda?: string) {
  const regEx = /<(Filename|FileName|IconFilename|RecipeImage|RecipeListMoodImage)>([^<]+)<\/\1>/g;
  let match = regEx.exec(line);
  let checked;
  if (match && (checked = anno.hasGraphicsFile(modPaths, match[2], annoRda)).length > 0) {
    const index = line.indexOf(match[2]);
    const range = new vscode.Range(lineIndex, index, lineIndex, index + match[2].length);

    const allPaths = annoRda ? [annoRda, ...modPaths] : modPaths;

    const diagnostic = new vscode.Diagnostic(range,
      `File seems to be missing.\nChecked paths:\n${allPaths.join('\n')}\nChecked patterns:\n${checked.join('\n')}`,
      vscode.DiagnosticSeverity.Warning);
    return diagnostic;
  }

  return undefined;
};

export function clear(fileUri: vscode.Uri) {
  diagnosticsCollection.delete(fileUri)
}

function _checkModOps(element: xmldoc.XmlElement, assetsDocument: xml.AssetsDocument, modPath: string, result: vscode.Diagnostic[]) {
  const stack = [ element ];
  for (var modop = stack.pop(); modop; modop = stack.pop()) {
    if (modop.name === 'ModOps' || modop.name === 'Group') {
      stack.push(...modop.children.filter(e => e.type === 'element'));
    }

    if (modop.name === 'ModOps') {
      
    }
    else if (modop.name === 'Group') {
      
    }
    else if (modop.name === 'ModOp') {
      var [ type, path_ ] = xml.getPathAttribute(modop);
      if (!type || type === 'Path') {
        type = modop.attr['Type'];
      }
      if (!type) {
        const range = text.getNameRange(modop, assetsDocument);
        const diagnostic = new vscode.Diagnostic(range, 'Missing `Type` attribute.', vscode.DiagnosticSeverity.Error);
        diagnostic.source = 'anno';
        diagnostic.code = {
          value: 'modop-missing-type',
          target: vscode.Uri.parse('https://jakobharder.github.io/anno-mod-loader/modops/#choose-type')
        }
        result.push(diagnostic);
      }
    }
    else if (modop.name === 'Include') {
      const file = modop.attr['File'];
      if (file === undefined) {
        const range = text.getNameRange(modop, assetsDocument);
        const diagnostic = new vscode.Diagnostic(range, 'Missing `File` attribute.', vscode.DiagnosticSeverity.Error);
        diagnostic.source = 'anno';
        diagnostic.code = {
          value: 'modop-include-missing-file',
          target: vscode.Uri.parse('https://jakobharder.github.io/anno-mod-loader/modops/control/#include')
        }
        result.push(diagnostic);
      }
      else {
        const filePath = file.startsWith('/')
          ? path.join(modPath, file.substring(1))
          : path.join(path.dirname(assetsDocument.filePath!), file);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          const relativePath = path.relative(modPath, filePath).replace(/\\/g, '/');
          const range = text.getAttributeValueRange(modop, 'File', assetsDocument);
          const diagnostic = new vscode.Diagnostic(range, `File \"${relativePath}\" not found.`, vscode.DiagnosticSeverity.Warning);
          diagnostic.source = 'anno';
          diagnostic.code = {
            value: 'modop-include-not-found',
            target: vscode.Uri.parse('https://jakobharder.github.io/anno-mod-loader/modops/control/#include')
          }
          result.push(diagnostic);
        }
      }
    }
    else if (modop.name === 'Asset') {

    }
    else {
      const range = text.getNameRange(modop, assetsDocument);
      const diagnostic = new vscode.Diagnostic(range, 'Expected `ModOp`, `Group`, `Include` or `Asset`.', vscode.DiagnosticSeverity.Error);
      diagnostic.source = 'anno';
      diagnostic.code = {
        value: 'modop-invalid',
        target: vscode.Uri.parse('https://jakobharder.github.io/anno-mod-loader/modops/')
      }
      result.push(diagnostic);
    }

    const config = modops.getTagInfos(assetsDocument.gameVersion)[modop.name];
    if (config && config.code && config.url) {
      const invalidAttributes = xml.getInvalidAttributes(modop, config.attributes);
      for (const attrib of invalidAttributes) {
        const range = text.getAttributeNameRange(modop, attrib, assetsDocument);
        const diagnostic = new vscode.Diagnostic(range, `Attribute \`${attrib}\` is not allowed.`, vscode.DiagnosticSeverity.Error);
        diagnostic.source = 'anno';
        diagnostic.code = {
          value: config.code,
          target: vscode.Uri.parse(config.url)
        }
        result.push(diagnostic);
      }
    }
  }
}

export function refresh(context: vscode.ExtensionContext, parsed: StaticAnalysis): void {
  if (!editor.isActive()) {
    return;
  }

  if (!editorFormats.isPatchXml(parsed.document)) {
    vscode.commands.executeCommand('setContext', 'anno-modding-tools.openPatchFile', false);
    return;
  }
  vscode.commands.executeCommand('setContext', 'anno-modding-tools.openPatchFile', true);

  const config = vscode.workspace.getConfiguration('anno');
  const checkFileNames = vscode.workspace.getConfiguration('anno', parsed.document.uri).get('checkFileNames');
  const annoRda: string | undefined = config.get('rdaFolder'); // TODO
  const modsFolder: string | undefined = config.get('modsFolder'); // TODO

  const modPaths = anno.searchModPaths(parsed.document.uri.fsPath, modsFolder);
  const modPath = anno.findModRoot(parsed.document.fileName);
  const version = anno.ModInfo.readVersion(modPath);

  const result: vscode.Diagnostic[] = [];
  result.push(...versionChecks.checkFilePaths(parsed.document, version));

  var inComment = false;

  // line diagnostics
  const issues = getIssues();
  for (let lineIndex = 0; lineIndex < parsed.document.lineCount; lineIndex++) {
    const lineOfText = parsed.document.lineAt(lineIndex);

    var line, comment;
    [ line, inComment, comment ] = xml.removeComments(lineOfText.text, inComment);

    if (comment.trim()) {
      const [ problem, found ] = utils.indexOfFirst(comment, '<!--', '--');
      if (problem >= 0) {
        const range = new vscode.Range(lineIndex, problem, lineIndex, problem + found.length);
        const diagnostic = new vscode.Diagnostic(range,
          found === '--' ? 'The string "--" is not allowed within comments.' : 'Comments are not allowed within comments.',
          vscode.DiagnosticSeverity.Error);
        diagnostic.code = found === '--' ? XML_DOUBLE_DASH : XML_NESTED_COMMENT;
        diagnostic.source = 'anno';
        result.push(diagnostic);
      }
    }

    if (!line.trim()) {
      continue;
    }

    for (var issue of issues) {
      const detected = checkDiagnosticIssue(line, lineIndex, issue);
      if (detected) {
        result.push(detected);
      }
    }

    if (checkFileNames) {
      const fileAction = checkFileName(modPaths, line, lineIndex, annoRda);
      if (fileAction) {
        result.push(fileAction);
      }
    }
  }

  // xml diagnostics
  if (parsed.assets?.content.name === 'ModOps') {
    _checkModOps(parsed.assets?.content, parsed.assets, modPath, result);
  }

  diagnosticsCollection.set(parsed.document.uri, result);
}

function checkDiagnosticIssue(textLine: string, lineIndex: number, issue: IIssueDescription) {

  if (issue.matchWord && utils.findWord(textLine, issue.matchWord)) {
    const index = textLine.indexOf(issue.matchWord);
    const range = new vscode.Range(lineIndex, index, lineIndex, index + issue.matchWord.length);
    const diagnostic = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Error);
    diagnostic.code = issue.code;
    diagnostic.source = 'anno';
    return diagnostic;
  }
  else if (issue.matchRegex) {
    const match = textLine.match(new RegExp(issue.matchRegex));
    if (match && match.index) {
      const index = match.index;
      const range = new vscode.Range(lineIndex, index, lineIndex, index + match[0].length);
      const diagnostic = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Error);
      diagnostic.code = issue.code;
      diagnostic.source = 'anno';
      return diagnostic;
    }
  }

  return undefined;
}
