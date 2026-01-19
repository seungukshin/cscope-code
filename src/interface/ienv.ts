import * as vscode from 'vscode';
import { FilePosition } from './position';
import IEditor from './ieditor';

export default interface IEnv {
	/**
	 * Destroy
	 * @returns {void}
	 */
	destroy(): void;

	/**
	 * Get a current directory.
	 * @returns {string} - A current directory.
	 */
	getCurrentDirectory(): string;

	/**
	 * Get all workspace directories.
	 * @returns {string[]} - All workspace directories.
	 */
	getAllDirectories(): string[];

	/**
	 * Get a current word under the cursor.
	 * @returns {string} - A current word.
	 */
	getCurrentWord(): string;

	/**
	 * Get a current position of the cursor.
	 * @returns {FilePosition | undefined} - A current position of the cursor.
	 */
	getCurrentPosition(): FilePosition | undefined;

	/**
	 * Open a file and return editor object.
	 * @param {FilePosition} position - A file name and cursor position.
	 * @param {boolean} preview - A preview option.
	 * @returns {Promise<IEditor>} - An editor object.
	 */
	open(position: FilePosition, preview: boolean): Promise<IEditor>;

	/**
	 * Show an input box and get an input.
	 * @param {string} value - A default value.
	 * @returns {Promise<string>} - An input value.
	 */
	getInput(value: string): Promise<string | undefined>;

	/**
	 * Observe changes of files.
	 * @param {string} extensions - File extensions to observe.
	 * @param {() => void} callback - A callback function to call when a file is changed.
	 * @returns {vscode.Disposable} - A disposible object.
	 */
	observeFiles(extensions: string, callback: () => void): vscode.Disposable;
}
