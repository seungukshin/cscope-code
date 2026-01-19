import * as vscode from 'vscode';
import * as path from 'path';
import IEnv from './interface/ienv';
import ILog from './interface/ilog';
import IStatusbar from './interface/istatusbar';
import IItem from './interface/iitem';
import Cscope from './cscope/cscope';

export class DefRefProvider implements vscode.DefinitionProvider, vscode.ReferenceProvider {
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

	private async getLocations(results: IItem[] | undefined, word: string): Promise<vscode.Location[]> {
		let locations: vscode.Location[] = [];
		if (!results) {
			return locations;
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
			const location = new vscode.Location(uri, range);
			locations.push(location);
		}
		return locations;
	}

	async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Location[] | undefined> {
		this.statusbar.show('cscope-code: querying...');
		const range = document.getWordRangeAtPosition(position);
		if (!range) {
			return undefined;
		}
		const word = document.getText(range);
		let results: IItem[] | undefined = undefined;
		try {
			results = await this.cscope.query('definition', word);
		} catch (err) {
			this.log.err('cannot query: ', err);
		}
		this.statusbar.hide();

		return this.getLocations(results, word);
	}

	async provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): Promise<vscode.Location[] | undefined> {
		this.statusbar.show('cscope-code: querying...');
		const range = document.getWordRangeAtPosition(position);
		if (!range) {
			return undefined;
		}
		const word = document.getText(range);
		let results: IItem[] | undefined = undefined;
		try {
			results = await this.cscope.query('symbol', word);
		} catch (err) {
			this.log.err('cannot query: ', err);
		}
		this.statusbar.hide();

		return this.getLocations(results, word);
	}
}
