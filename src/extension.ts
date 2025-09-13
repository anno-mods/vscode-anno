import * as vscode from 'vscode';
import * as annoContext from './editor/modContext';
import { registerGuidUtilsProvider } from './features/guidUtilsProvider';
import * as dds from './tools/dds';
import * as rdp from './tools/rdp';
import * as AssetsDecorator from './languages/xml/assetsDecorator';
import * as AssetsSymbolProvider from './languages/xml/assetsSymbolProvider';
import * as commands from './features/commands';
import * as cfg from './languages/cfg';
import * as cf7 from './languages/cf7';
import * as ifo from './languages/ifo';
import * as schemas from './languages/schemas';
import * as wordSelector from './languages/wordSelector';
import * as xml from './languages/xml';
import * as statusBar from './features/statusBar';
import * as rda from './data/rda';
import * as editor from './editor';
import * as xmltest from './tools/xmltest';

import * as logger from './other/logger';
import * as channel from './features/channel';
import { SymbolRegistry } from './data/symbols';


export function activate(context: vscode.ExtensionContext) {
	logger.set(channel);

	rda.init(context);
	xmltest.init(context.asAbsolutePath);
	SymbolRegistry.init(context.asAbsolutePath('./generated/'));

	annoContext.activate(context);

	rdp.init(context.asAbsolutePath('./external/'));
	dds.init(context.asAbsolutePath('./external/'));

	context.subscriptions.push(...registerGuidUtilsProvider(context));

	AssetsDecorator.activate(context);
	cfg.activate(context);
	cf7.activate(context);
	ifo.activate(context);
	xml.activate(context);
	schemas.activate(context);
	wordSelector.activate(context);
	AssetsSymbolProvider.activate(context);

	editor.activate(context);
	editor.onDidChangeGamePath(() => SymbolRegistry.resetVanilla());

	statusBar.activate(context);
	commands.registerCommands(context);
}

// this method is called when your extension is deactivated
export function deactivate() {}
