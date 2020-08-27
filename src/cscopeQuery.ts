import * as vscode from 'vscode';
import * as path from 'path';

export class CscopeItem implements vscode.QuickPickItem, vscode.CallHierarchyItem {
	private rest: string;
	private text: string;
	// for QuickPickItem
	label: string;
	// for CallHierarchyItem
	detail: string;
	kind: vscode.SymbolKind;
	name: string;
	range: vscode.Range;
	selectionRange: vscode.Range;
	uri: vscode.Uri;

	constructor(uri: vscode.Uri, func: string, range: vscode.Range, rest: string, text: string) {
		const offset = vscode.workspace.rootPath ? vscode.workspace.rootPath.length + 1 : 0;
		this.uri = uri;
		this.name = func;
		this.rest = rest;
		this.text = text;
		this.label = func + ' : ' + rest;
		this.detail = uri.fsPath.substring(offset) + ':' + range.start.line.toString() + ':' + range.start.character.toString();
		this.kind = vscode.SymbolKind.Function;
		this.range = range;
		this.selectionRange = range;
	}

	getUri(): vscode.Uri {
		return this.uri;
	}

	getFile(): string {
		return this.uri.fsPath;
	}

	getFunction(): string {
		return this.name;
	}

	getRange(): vscode.Range {
		return this.range;
	}

	getLineNumber(): number {
		return this.range.start.line;
	}

	getColumnNumber(): number {
		return this.range.start.character;
	}

	getLine(): string {
		return this.rest;
	}
}

export class CscopeQuery {
	private type: string;
	private pattern: string;
	private results: CscopeItem[];

	constructor(type: string, pattern: string) {
		this.type = type;
		this.pattern = pattern;
		this.results = [];
	}

	getType(): string {
		return this.type;
	}

	getPattern(): string {
		return this.pattern;
	}

	getResult(): CscopeItem[] {
		return this.results;
	}

	private getFullPath(file: string): string {
		if (path.isAbsolute(file)) {
			return file;
		}
		const root = vscode.workspace.rootPath ? vscode.workspace.rootPath : '';
		return path.posix.join(root, file);
	}

	async setResults(output: string): Promise<void> {
		const lines = output.split('\n');
		for (let line of lines) {
			if (line.length < 3) {
				continue;
			}
			// TODO: what if file name contains a space?
			const file_last = line.indexOf(' ');
			const func_last = line.indexOf(' ', file_last + 1);
			const line_last = line.indexOf(' ', func_last + 1);
			const file = this.getFullPath(line.slice(0, file_last));
			const func = line.slice(file_last + 1, func_last);
			const lnum = parseInt(line.slice(func_last + 1, line_last)) - 1;
			const rest = line.slice(line_last + 1);
			let text = '';
			let cnum = 0;
			let length = 0;
			const uri = vscode.Uri.file(file);
			try {
				const f = await vscode.workspace.openTextDocument(uri);
				text = f.lineAt(lnum).text;
				if (this.type === 'callee') {
					cnum = text.search(func);
					length = func.length;
				} else {
					cnum = text.search(this.pattern);
					length = this.pattern.length;
				}
				if (cnum == -1) {
					// If search pattern is not found in that line, still display the result
					// Because the intended result could be shifted by a few lines due to the
					// database not being up to date.
					// TODO: should we search the whole file instead at this point?
					cnum = 0;
					length = 0;
				}
				const range = new vscode.Range(lnum, cnum, lnum, cnum + length);
				this.results.push(new CscopeItem(uri, func, range, rest, text));
			} catch (err) {
				const msg: string = 'Could not open "' + file + '".';
				vscode.window.showWarningMessage(msg);
			}
		}
	}
}