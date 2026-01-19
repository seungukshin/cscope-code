import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import IConfig from './interface/iconfig';
import Config from './code/config';
import ILog from './interface/ilog';
import Log from './code/log';
import IEnv from './interface/ienv';
import Env from './code/env';
import IStatusbar from './interface/istatusbar';
import Statusbar from './code/statusbar';
import IResource from './interface/iresource';
import Resource from './code/resource';
import IFileSelectList from './interface/ifile-select-list';
import FileSelectList from './code/file-select-list';
import IFileTreeData from './interface/ifile-tree-data';
import FileTreeData from './code/file-tree-data';
import { FilePosition } from './interface/position';
import History from './interface/history';
import IItem from './interface/iitem';
import Cscope from './cscope/cscope';
import { HierarchyProvider } from './hierarchy-provider';
import { DefRefProvider } from './def-ref-provider';

export class CscopeCode implements vscode.Disposable {
	/**
	 * @property {vscode.Disposable[]} subscriptions
	 * @property {vscode.Disposable | undefined} buildDisposable
	 * @property {IConfig} config
	 * @property {ILog} log
	 * @property {IEnv} env
	 * @property {IStatusbar} statusbar
	 * @property {IResource} res
	 * @property {History} history
	 * @property {Cscope} cscope
	 * @property {String} prevWord
	 * @property {String} prevCwd
	 * @property {IItem[]} prevResults
	 * @property {TreeDataProvider | undefined} treeView
	 * @property {Disposable | undefined} hierarchy
	 * @property {Disposable | undefined} definition
	 * @property {Disposable | undefined} reference
	 */
	private subscriptions: vscode.Disposable[];
	private buildDisposable: vscode.Disposable | undefined;
	private config: IConfig;
	private log: ILog;
	private env: IEnv;
	private statusbar: IStatusbar;
	private res: IResource;
	private history: History;
	private cscope: Cscope;
	private prevWord: string;
	private prevCwd: string;
	private prevResults: IItem[];
	private treeView: IFileTreeData | undefined;
	private hierarchy: vscode.Disposable | undefined;
	private definition: vscode.Disposable | undefined;
	private reference: vscode.Disposable | undefined;

	/**
	 * @constructor
	 * @param {vscode.ExtensionContext} context
	 */
	constructor(context: vscode.ExtensionContext) {
		this.subscriptions = context.subscriptions;
		this.buildDisposable = undefined;
		this.config = Config.getInstance('cscope-code');
		this.log = Log.getInstance('cscope-code', this.config);
		this.env = Env.getInstance();
		this.statusbar = Statusbar.getInstance();
		this.res = Resource.getInstance(context.extensionUri);
		this.history = new History(this.log);
		this.cscope = new Cscope(this.config, this.log, this.env);
		this.prevWord = '';
		this.prevCwd = '';
		this.prevResults = [];
		this.treeView = undefined;
		this.hierarchy = undefined;
		this.definition = undefined;
		this.reference = undefined;

		// Configuration Watcher
		this.setWatchers();
		context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
			this.config.reload();
			this.setWatchers(e);
		}));

		// Register Commands
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:build", () => this.build()));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:symbol", () => this.query('symbol', false)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:symbol-input", () => this.query('symbol', true)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:definition", () => this.query('definition', false)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:definition-input", () => this.query('definition', true)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:callee", () => this.query('callee', false)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:callee-input", () => this.query('callee', true)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:caller", () => this.query('caller', false)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:caller-input", () => this.query('caller', true)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:text", () => this.query('text', false)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:text-input", () => this.query('text', true)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:egrep", () => this.query('egrep', false)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:egrep-input", () => this.query('egrep', true)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:file", () => this.query('file', false)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:file-input", () => this.query('file', true)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:include", () => this.query('include', false)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:include-input", () => this.query('include', true)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:set", () => this.query('set', false)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:set-input", () => this.query('set', true)));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:show-results", () => this.showResults()));
		this.subscriptions.push(vscode.commands.registerCommand("cscope-code:pop", () => this.pop()));
		this.subscriptions.push(vscode.commands.registerCommand('cscope-code:go', (uri, range) => this.go(uri, range)));
		this.subscriptions.push(vscode.commands.registerCommand('cscope-code:clear', () => this.treeView?.clear()));
	}

	/**
	 * Set up watchers
	 * @returns {void}
	 */
	private setWatchers(e: vscode.ConfigurationChangeEvent | undefined = undefined): void {
		// Check auto build configuration
		if (!e || e.affectsConfiguration('cscope-code.auto') || e.affectsConfiguration('cscope-code.extension')) {
			if (this.config.get('auto')) {
				const root = this.env.getCurrentDirectory();
				const db = path.join(root, this.config.get('database'));
				fs.access(db, fs.constants.F_OK, (err) => {
					if (err) {
						this.build();
					}
				});
				if (!this.buildDisposable) {
					this.buildDisposable = this.env.observeFiles(this.config.get('extensions'), this.build.bind(this));
				}
			} else {
				this.buildDisposable?.dispose();
				this.buildDisposable = undefined;
			}
		}

		// Check call hierarchy provider configuration
		if (!e || e.affectsConfiguration('cscope-code.hierarchy')) {
			if (this.config.get('hierarchy')) {
				if (!this.hierarchy) {
					this.hierarchy = vscode.languages.registerCallHierarchyProvider('c', new HierarchyProvider(this.log, this.env, this.statusbar, this.cscope));
				}
			} else {
				this.hierarchy?.dispose();
				this.hierarchy = undefined;
			}
		}

		// Check definition provider configuration
		if (!e || e.affectsConfiguration('cscope-code.definition')) {
			if (this.config.get('definition')) {
				if (!this.definition) {
					this.definition = vscode.languages.registerDefinitionProvider('c', new DefRefProvider(this.log, this.env, this.statusbar, this.cscope));
				}
			} else {
				this.definition?.dispose();
				this.definition = undefined;
			}
		}

		// Check reference provider configuration
		if (!e || e.affectsConfiguration('cscope-code.reference')) {
			if (this.config.get('reference')) {
				if (!this.reference) {
					this.reference = vscode.languages.registerReferenceProvider('c', new DefRefProvider(this.log, this.env, this.statusbar, this.cscope));
				}
			} else {
				this.reference?.dispose();
				this.reference = undefined;
			}
		}
	}

	/**
	 * Dispose
	 * @returns {void}
	 */
	dispose(): void {
		this.buildDisposable?.dispose();
		this.buildDisposable = undefined;
		this.statusbar.destroy();
		this.env.destroy();
		this.treeView?.dispose();
		this.hierarchy?.dispose();
		this.definition?.dispose();
		this.reference?.dispose();
	}

	/**
	 * Build
	 * @returns {Promise<void>}
	 */
	async build(): Promise<void> {
		this.statusbar.show('cscope-code: building...');
		try {
			await this.cscope.build();
		} catch (err) {
			this.log.err('cannot build the database: ', err);
		}
		this.statusbar.hide();
	}

	/**
	 * @param {string} type
	 * @param {string} word
	 * @param {string} cwd
	 * @returns {Promise<IItem[] | undefined>}
	 */
	async __query(type: string, word: string, cwd: string): Promise<IItem[] | undefined> {
		this.statusbar.show('cscope-code: querying...');
		let results: IItem[] | undefined = undefined;
		try {
			results = await this.cscope.query(type, word);
		} catch (err) {
			this.log.err('cannot query: ', err);
		}
		this.statusbar.hide();
		return results;
	}

	/**
	 * @param {IItem[]} items
	 * @param {string} word
	 * @param {string} cwd
	 * @returns {Promise<void>}
	 */
	async __showTree(items: IItem[], word: string, cwd: string): Promise<void> {
		const date = new Date();
		const cmd = this.cscope.getQueryCmd() + ' (' + date.toLocaleString('en-US', { hour12: false }) + ')';
		if (!this.treeView) {
			this.treeView = new FileTreeData(this.config, this.env, this.res);
		}
		this.treeView.reload(items, word, cwd, cmd);
	}

	/**
	 * @param {IItem[]} items
	 * @param {string} word
	 * @param {string} cwd
	 * @returns {Promise<boolean>}
	 */
	async __showList(items: IItem[], word: string, cwd: string): Promise<boolean> {
		const selectList: IFileSelectList = new FileSelectList(this.env, this.res, items, word, cwd, true);
		let selected = false;
		try {
			selected = await selectList.show();
		} catch (err) {
			if (err !== 'cancelled') {
				this.log.err('cannot show the select list: ', err);
			}
		}
		selectList.destroy();
		return selected;
	}

	/**
	 * @param {string} type
	 * @param {boolean} input
	 * @returns {Promise<void>}
	 */
	async query(type: string, input: boolean): Promise<void> {
		const cwd = this.env.getCurrentDirectory();
		let word: string | undefined = this.env.getCurrentWord();
		if (input) {
			try {
				word = await this.env.getInput(word);
			} catch (err) {
				this.log.err('cannot get a word to query: ', err);
				return;
			}
		}
		if (!word) {
			this.log.err('cannot get a word to query');
			return;
		}
		const results = await this.__query(type, word, cwd);
		if (!results) {
			this.log.err('cannot get any result');
			return;
		}
		this.prevWord = word;
		this.prevCwd = cwd;
		this.prevResults = results;
		const position = this.env.getCurrentPosition();
		if (this.config.get('output') == 'TreeView') {
			this.__showTree(results, word, cwd);
		} else {
			const selected = await this.__showList(results, word, cwd);
			if (selected && position) {
				this.history.push(position);
			}
		}
	}

	/**
	 * @returns {Promise<void>}
	 */
	async showResults(): Promise<void> {
		if (!this.prevResults) {
			return;
		}
		const position = this.env.getCurrentPosition();
		const selected = await this.__showList(this.prevResults, this.prevWord, this.prevCwd);
		if (selected && position) {
			this.history.push(position);
		}
	}

	/**
	 * @returns {Promise<FilePosition | undefined>}
	 */
	async pop(): Promise<FilePosition | undefined> {
		const position = this.history.pop();
		if (position) {
			this.env.open(position, false);
		}
		return position;
	}

	/**
	 * @param {FilePosition} position
	 * @param {string} word
	 * @returns {Promise<void>}
	 */
	async go(position: FilePosition, word: string): Promise<void> {
		const oldPosition = this.env.getCurrentPosition();
		const editor = await this.env.open(position, false);
		const line = position.getLine();
		const text = editor.getTextLine(line);
		const column = text?.indexOf(word);
		if (column && column > 0) {
			editor.setCurosr(line, column);
		}
		if (oldPosition) {
			this.history.push(oldPosition);
		}
	}
}

let cscopeCode: CscopeCode | undefined;

export function activate(context: vscode.ExtensionContext): void {
	cscopeCode = new CscopeCode(context);
	console.log('"cscope-code" is now active!');
}

export function deactivate(): void {
	if (cscopeCode) {
		cscopeCode.dispose();
		cscopeCode = undefined;
	}
	console.log('"cscope-code" is now inactive!');
}