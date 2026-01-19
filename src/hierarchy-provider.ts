import * as vscode from 'vscode';
import * as path from 'path';
import IEnv from './interface/ienv';
import ILog from './interface/ilog';
import IStatusbar from './interface/istatusbar';
import IItem from './interface/iitem';
import Cscope from './cscope/cscope';

export class HierarchyProvider implements vscode.CallHierarchyProvider {
	/**
	 * @property {ILog} log
	 * @property {IEnv} env
	 * @property {IStatusbar} statusbar
	 * @property {Cscope} cscope
	 * @property {string} cwd
	 */
	private log: ILog;
	private env: IEnv;
	private statusbar: IStatusbar;
	private cscope: Cscope;
	private cwd: string;

	/**
	 * @constructor
	 * @param {ILog} log
	 * @param {IEnv} env
	 * @param {IStatusbar} statusbar
	 * @param {Cscope} cscope
	 */
	constructor(log: ILog, env: IEnv, statusbar: IStatusbar, cscope: Cscope) {
		this.log = log;
		this.env = env;
		this.statusbar = statusbar;
		this.cscope = cscope;
		this.cwd = this.env.getCurrentDirectory();
	}

	/**
	 * @param {vscode.TextDocument} document
	 * @param {vscode.Position} position
	 * @param {vscode.CancellationToken} token
	 * @returns {vscode.CallHierarchyItem | undefined}
	 */
	prepareCallHierarchy(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.CallHierarchyItem | undefined {
		const range = document.getWordRangeAtPosition(position);
		if (!range) {
			return undefined;
		}
		const word = document.getText(range);
		return new vscode.CallHierarchyItem(vscode.SymbolKind.Function, word, '', document.uri, range, range);
	}

	/**
	 * @param {IItem[] | undefined} results
	 * @param {string} word
	 * @param {(new (item: vscode.CallHierarchyItem, ranges: vscode.Range[]) => T)} type
	 * @returns {Promise<T[]>}
	 */
	private async getCallHierarchy<T>(results: IItem[] | undefined, word: string, type: (new (item: vscode.CallHierarchyItem, ranges: vscode.Range[]) => T)): Promise<T[]> {
		const items: T[] = [];
		if (!results) {
			return items;
		}
		for (let result of results) {
			const file = result.getFile();
			const fullpath = path.isAbsolute(file) ? file : path.join(this.cwd, file);
			const uri = vscode.Uri.file(fullpath);
			const line = result.getLine();
			const doc = await vscode.workspace.openTextDocument(uri);
			const text = doc.lineAt(line).text;
			let column = text?.indexOf(word);
			if (!column || column < 0) {
				column = 0;
			}
			const range = new vscode.Range(line, column, line, column + word.length);
			const name = result.getFunction();
			const detail = '[' + uri.fsPath.substring(this.cwd.length + 1) + ':' + range.start.line.toString() + ':' + range.start.character.toString() + ']' + text;
			const callHierarchyItem = new vscode.CallHierarchyItem(vscode.SymbolKind.Function, name, detail, uri, range, range);
			const item = new type(callHierarchyItem, [range]);
			items.push(item);
		}
		return items;
	}

	/**
	 * @param {vscode.CallHierarchyItem} item
	 * @param {vscode.CancellationToken} token
	 * @returns {Promise<vscode.CallHierarchyOutgoingCall[]>}
	 */
	async provideCallHierarchyOutgoingCalls(item: vscode.CallHierarchyItem, token: vscode.CancellationToken): Promise<vscode.CallHierarchyOutgoingCall[]> {
		this.statusbar.show('cscope-code: querying...');
		let results: IItem[] | undefined = undefined;
		try {
			results = await this.cscope.query('callee', item.name);
		} catch (err) {
			this.log.err('cannot query: ', err);
		}
		this.statusbar.hide();

		return this.getCallHierarchy(results, item.name, vscode.CallHierarchyOutgoingCall);
	}

	/**
	 * @param {vscode.CallHierarchyItem} item
	 * @param {vscode.CancellationToken} token
	 * @returns {Promise<vscode.CallHierarchyIncomingCall[]>}
	 */
	async provideCallHierarchyIncomingCalls(item: vscode.CallHierarchyItem, token: vscode.CancellationToken): Promise<vscode.CallHierarchyIncomingCall[]> {
		this.statusbar.show('cscope-code: querying...');
		let results: IItem[] | undefined = undefined;
		try {
			results = await this.cscope.query('caller', item.name);
		} catch (err) {
			this.log.err('cannot query: ', err);
		}
		this.statusbar.hide();

		return this.getCallHierarchy(results, item.name, vscode.CallHierarchyIncomingCall);
	}
}
