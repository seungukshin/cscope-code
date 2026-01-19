import path = require("path");
import IItem from "../interface/iitem";

export default class Item implements IItem {
	/**
	 * @property {string} file
	 * @property {string} func
	 * @property {number} line
	 * @property {string} text
	 * @property {string} raw
	 */
	private file: string;
	private func: string;
	private line: number;
	private text: string;
	private raw: string;
	private parent: string;

	/**
	 * @constructor
	 * @param {string} line
	 */
	constructor(line: string, parent: string) {
		const tokens = line.match(/([^ ]*) +([^ ]*) +([^ ]*) (.*)/);
		if (tokens == null || tokens.length < 5) {
			throw new Error('wrong format');
		}
		this.file = tokens[1];
		this.func = tokens[2];
		this.line = parseInt(tokens[3]) - 1;
		this.text = tokens[4];
		this.raw = line;
		this.parent = parent;
		return this;
	}

	/**
	 * Get the file name
	 * @returns {string}
	 */
	getFile(): string {
		return path.join(this.parent, this.file);
	}

	/**
	 * Get the function name
	 * @returns {string}
	 */
	getFunction(): string {
		return this.func;
	}

	/**
	 * Get the line number
	 * @returns {number}
	 */
	getLine(): number {
		return this.line;
	}

	/**
	 * Get the text
	 * @returns {string}
	 */
	getText(): string {
		return this.text;
	}

	/**
	 * Get the raw text
	 * @returns {string}
	 */
	getRaw(): string {
		return this.raw;
	}
}
