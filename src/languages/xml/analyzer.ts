import * as vscode from "vscode";

import * as decorations from './decorations';
import * as diagnostics from './diagnostics';
import * as life from './diagnostics/life';
import * as xml from '../../anno/xml';

export interface StaticAnalysis {
  document: vscode.TextDocument;
  assets: xml.AssetsDocument | undefined;
}

export interface Analysis {
  document: vscode.TextDocument;
}

export class Analyzer<ResultType extends Analysis> {
  private cache = new Map<string, ResultType>();
  private inflight = new Map<string, Promise<ResultType>>();
  private timers = new Map<string, NodeJS.Timeout>();
  private readonly onAnalyzedEmitter = new vscode.EventEmitter<{ uri: vscode.Uri; result: Analysis }>();
  readonly onAnalyzed = this.onAnalyzedEmitter.event;

  readonly onScan: (doc: vscode.TextDocument) => ResultType;
  readonly onClear: (uri: vscode.Uri) => undefined;

  constructor(private debounceMs = 120,
    onScan: (doc: vscode.TextDocument, cached?: ResultType) => ResultType,
    onClear: (uri: vscode.Uri) => undefined) {
      this.onScan = onScan;
      this.onClear = onClear;
    }

  schedule(doc: vscode.TextDocument) {
    const key = doc.uri.toString();
    clearTimeout(this.timers.get(key)!);
    const t = setTimeout(() => this.ensure(doc), this.debounceMs);
    this.timers.set(key, t);
  }

  async ensure(doc: vscode.TextDocument): Promise<ResultType> {
    const key = doc.uri.toString();

    const cached = this.cache.get(key);
    if (cached && cached.document.version === doc.version) {
      return cached;
    }

    const running = this.inflight.get(key);
    if (running) return running;

    const promise = (async () => {
      try {
        const result = await this.parse(doc);
        if (result && result.document.version === doc.version) {
          this.cache.set(key, result);
          this.onAnalyzedEmitter.fire({ uri: doc.uri, result });
        }
        return result;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  cancel(uri: vscode.Uri) {
    const key = uri.toString();
    clearTimeout(this.timers.get(key)!);
    this.inflight.delete(key);
  }

  clear(uri: vscode.Uri) {
    this.cancel(uri);
    this.cache.delete(uri.toString());
    this.onClear(uri);
  }

  private async parse(doc: vscode.TextDocument): Promise<ResultType> {
    return this.onScan(doc);
  }
}

export var staticAnalyzer: Analyzer<StaticAnalysis>;

export function activate(context: vscode.ExtensionContext) {
  var activeEditor = vscode.window.activeTextEditor;

  staticAnalyzer = new Analyzer<StaticAnalysis>(100,
    (document: vscode.TextDocument) => {
      return {
        document,
        assets: xml.AssetsDocument.from(document.getText(), document.uri.fsPath, false)
       };
    },
    (uri: vscode.Uri) => { diagnostics.clear(uri); }
  );

  const dynamicAnalyzer = new Analyzer<Analysis>(500,
    (document: vscode.TextDocument) => { return { document } },
    (uri: vscode.Uri) => { life.clear(uri); });

  const refreshStaticAnalysis = (result: StaticAnalysis) => {
    if (vscode.window.activeTextEditor?.document === result.document) {
      decorations.refresh(vscode.window.activeTextEditor);
    }
    diagnostics.refresh(context, result.document);
  }

  const refreshLifeAnalysis = (result: Analysis) => {
    life.refresh(context, result.document);
  }

  if (activeEditor) {
    staticAnalyzer.ensure(activeEditor.document).then(refreshStaticAnalysis);
    dynamicAnalyzer.ensure(activeEditor.document).then(refreshLifeAnalysis);
  }

  vscode.window.onDidChangeActiveTextEditor(editor => {
    activeEditor = editor;
    if (editor) {
      staticAnalyzer.ensure(editor.document).then(refreshStaticAnalysis);
      dynamicAnalyzer.ensure(editor.document).then(refreshLifeAnalysis);
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidChangeTextDocument(async (event) => {
    if (activeEditor?.document && event.document) {
      staticAnalyzer.ensure(activeEditor.document).then(refreshStaticAnalysis);
      dynamicAnalyzer.clear(activeEditor.document.uri);
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidSaveTextDocument(async (event) => {
    if (activeEditor?.document.uri === event.uri) {
      staticAnalyzer.ensure(activeEditor.document).then(refreshStaticAnalysis);
      dynamicAnalyzer.ensure(activeEditor.document).then(refreshLifeAnalysis);
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidRenameFiles(async (event) => {
    for (const { oldUri, newUri } of event.files) {
      staticAnalyzer.clear(oldUri);
      dynamicAnalyzer.clear(oldUri);
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidDeleteFiles(async (event) => {
    for (const uri of event.files) {
      staticAnalyzer.clear(uri);
      dynamicAnalyzer.clear(uri);
    }
  })
}
