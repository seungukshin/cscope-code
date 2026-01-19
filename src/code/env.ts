
import * as vscode from 'vscode';
import * as path from 'path';
import * as process from 'process';
import { FilePosition } from '../interface/position';
import IEditor from '../interface/ieditor';
import Editor from './editor';
import IEnv from '../interface/ienv';

export default class Env implements IEnv {
	/**
	 * @property {Env} instance - instance
	 */
	private static instance: Env;

	/**
	 * @constructor
	 */
	private constructor() {
		if (!Env.instance) {
			Env.instance = this;
		}
		return Env.instance;
	}

	/**
	 * Get the environment
	 * @returns {Env}
	 */
	static getInstance(): Env {
		if (!Env.instance) {
			new Env();
		}
		return Env.instance;
	}

	/**
	 * Destroy
	 * @returns {void}
	 */
	destroy(): void {}

	/**
	 * Get a current directory.
	 * @returns {string} - A current directory.
	 */
	getCurrentDirectory(): string {
		const workspaces = vscode.workspace.workspaceFolders;
		if (workspaces && workspaces.length > 0) {
			return workspaces[0].uri.fsPath;
		}
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const file = editor.document.uri.fsPath;
			return path.dirname(file);
		}
		if (process.env.home) {
			return process.env.home;
		}
		return '';
	}

	/**
	 * Get all workspace directories.
	 * @returns {string[]} - All workspace directories.
	 */
	getAllDirectories(): string[] {
		const workspaces = vscode.workspace.workspaceFolders;
		if (workspaces && workspaces.length > 0) {
			return workspaces.map((folder: vscode.WorkspaceFolder) => folder.uri.fsPath);
		}
		return [this.getCurrentDirectory()];
	}

	/**
	 * Get a current word under the cursor.
	 * @returns {string} - A current word.
	 */
	getCurrentWord(): string {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return '';
		}
		const document = editor.document;
		const selection = editor.selection;
		if (!selection.isEmpty) {
			return document.getText(selection);
		}
		const range = document.getWordRangeAtPosition(selection.active);
		if (!range) {
			return '';
		}
		return document.getText(range);
	}

	/**
	 * Get a current position of the cursor.
	 * @returns {FilePosition | undefined} - A current position of the cursor.
	 */
	getCurrentPosition(): FilePosition | undefined {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return undefined;
		}
		const document = editor.document;
		const selection = editor.selection;
		const file = document.uri.fsPath;
		const point = selection.active;
		return new FilePosition(file, point.line, point.character);
	}

	/**
	 * Open a file and return editor object.
	 * @param {FilePosition} position - A file name and cursor position.
	 * @param {boolean} preview - A preview option.
	 * @returns {Promise<IEditor>} - An editor object.
	 */
	async open(position: FilePosition, preview: boolean): Promise<IEditor> {
		return new Promise((resolve, reject) => {
			vscode.workspace.openTextDocument(position.getFile()).then((document) => {
				const range = new vscode.Range(position.getLine(), position.getColumn(), position.getLine(), position.getColumn());
				let options = {
					preserveFocus: false,
					preview: false,
					selection: range,
					viewColumn: vscode.ViewColumn.Active
				};
				if (preview) {
					options.preserveFocus = true;
					options.preview = true;
					options.viewColumn = vscode.ViewColumn.Beside;
				}
				vscode.window.showTextDocument(document, options).then((editor) => {
					resolve(new Editor(editor));
				}), ((error: any) => {
					reject(error);
				});
			}), ((error: any) => {
				reject(error);
			});
		});
	}

	/**
	 * Show an input box and get an input.
	 * @param {string} value - A default value.
	 * @returns {Promise<string | undefined>} - An input value.
	 */
	async getInput(value: string): Promise<string | undefined> {
		return vscode.window.showInputBox({ value: value });
	}

	/**
	 * Observe changes of files.
	 * @param {string} extensions - File extensions to observe.
	 * @param {() => void} callback - A callback function to call when a file is changed.
	 * @returns {vscode.Disposable} - A disposible object.
	 */
	observeFiles(extensions: string, callback: () => void): vscode.Disposable {
		const root = this.getCurrentDirectory();
		const pattern = path.posix.join(root, '**/*.{' + extensions + '}');
		const fswatcher = vscode.workspace.createFileSystemWatcher(pattern);
		fswatcher.onDidChange(() => callback());
		fswatcher.onDidCreate(() => callback());
		fswatcher.onDidDelete(() => callback());
		return fswatcher;
	}
}
