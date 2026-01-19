import * as cp from 'child_process';
import * as rl from 'readline';
import IConfig from '../interface/iconfig';
import ILog from '../interface/ilog';
import IEnv from '../interface/ienv';
import IItem from '../interface/iitem';
import Item from './item';
import path = require('path');

const QueryType: { [key: string]: string } = Object.freeze({
	'symbol': '-0',
	'definition': '-1',
	'callee': '-2',
	'caller': '-3',
	'text': '-4',
	'egrep': '-5',
	'file': '-6',
	'include': '-7',
	'set': '-8'
});

function promiseState(p: Promise<any>): Promise<string> {
	const t = {};
	return Promise.race([p, t])
		.then(v => (v === t) ? 'pending' : 'fulfilled', () => 'rejected');
}

export default class Cscope {
	/**
	 * @property {IConfig} config
	 * @property {ILog} log
	 * @property {IEnv} env
	 * @property {string} buildCmd;
	 * @property {string} queryCmd;
	 */
	private config: IConfig;
	private log: ILog;
	private env: IEnv;
	private buildCmd: string;
	private queryCmd: string;
	private buildQueue: Promise<string>[];

	/**
	 * @constructor
	 * @param {IConfig} config
	 * @param {ILog} log
	 * @param {IEnv} env
	 */
	constructor(config: IConfig, log: ILog, env: IEnv) {
		this.config = config;
		this.log = log;
		this.env = env;
		this.buildCmd = '';
		this.queryCmd = '';
		this.buildQueue = [
			Promise.resolve(''),
			Promise.resolve('')
		];
	}

	/**
	 * @returns {Promise<string>}
	 */
	async build(): Promise<string> {
		const directories = this.env.getAllDirectories();
		
		this.log.info(`Building cscope databases for ${directories.length} workspace folders...`);
		const results: string[] = [];
		for (const dir of directories) {
			try {
				const result = await this.buildSingle(dir);
				results.push(result);
			} catch (err) {
				this.log.err(`Failed to build database for ${dir}:`, err);
				results.push(`Error: ${err}`);
			}
		}
		return results.join('\n');
	}

	/**
	 * @param {string} cwd - current working directory
	 * @returns {Promise<string>}
	 */
	private async buildSingle(cwd: string): Promise<string> {
		let index = 0;
		const len = this.buildQueue.length;
		for (index = 0; index < len; index++) {
			const state = await promiseState(this.buildQueue[index]);
			this.log.info('queue state', index, state);
			if (state != 'pending') {
				break;
			}
		}
		if (index >= len) {
			this.log.info('queue full');
			return Promise.reject('queue full');
		}
		const pendingPromises = this.buildQueue.filter(async (p) => await promiseState(p) == 'pending');
		this.buildQueue[index] = new Promise((resolve, reject) => {
			Promise.all(pendingPromises).then((values) => {
				this.log.info('start to build');
				const cmd = this.config.get<string>('cscope');
				const db = this.config.get<string>('database');
				const buildArgs = this.config.get<string>('buildArgs');
				const args = [buildArgs, '-f', db];
				this.buildCmd = [cmd, ...args].join(' ');
				this.log.info(cmd, args, cwd);

				let out = '';
				let err = '';
				const proc = cp.spawn(cmd, args, { cwd: cwd });
				proc.stdout.on('data', (data) => {
					out = out.concat(data.toString());
				});
				proc.stderr.on('data', (data) => {
					err = err.concat(data.toString());
				});
				proc.on('error', (error) => {
					this.log.err('error:', error);
					reject(error.toString().trim());
				});
				proc.on('close', (code) => {
					if (err.length > 0) {
						this.log.err(`stderr: ${code}\n${err}`);
					}
					this.log.info(`stdout: ${code}\n${out}`);
					if (code != 0) {
						this.log.info('done to build: error');
						reject(err.trim());
					} else {
						this.log.info('done to build: success');
						resolve(out.trim());
					}
				});
			});
		});
		return this.buildQueue[index];
	}

	/**
	 * @param {string} type
	 * @param {string} word
	 * @returns {Promise<IItem[]>}
	 */
	async query(type: string, word: string): Promise<IItem[]> {
		const directories = this.env.getAllDirectories();
		
		this.log.info(`Querying across ${directories.length} workspace folders...`);
		const allResults: IItem[] = [];
		for (const dir of directories) {
			try {
				const results = await this.querySingle(type, word, dir);
				allResults.push(...results);
			} catch (err) {
				this.log.err(`Failed to query in ${dir}:`, err);
			}
		}
		return allResults;
	}

	/**
	 * @param {string} type
	 * @param {string} word
	 * @param {string} cwd - current working directory
	 * @returns {Promise<IItem[]>}
	 */
	private async querySingle(type: string, word: string, cwd: string): Promise<IItem[]> {
		return new Promise((resolve, reject) => {
			const cmd = this.config.get<string>('cscope');
			const db = this.config.get<string>('database');
			const queryArgs = this.config.get<string>('queryArgs');
			const args = [queryArgs, '-f', db, QueryType[type], word];
			const parent = path.relative(this.env.getCurrentDirectory(), cwd);
			this.queryCmd = [cmd, ...args].join(' ');
			this.log.info(cmd, args, cwd);

			let results: IItem[] = [];
			let out = '';
			let err = '';
			const proc = cp.spawn(cmd, args, { cwd: cwd });
			const rline = rl.createInterface({ input: proc.stdout, terminal: false });
			rline.on('line', (line) => {
				try {
					results.push(new Item(line, parent));
				} catch (err) {
					this.log.err(err);
					this.log.err('cannot parse:', line);
				}
				out = out.concat(line);
			});
			proc.stderr.on('data', (data) => {
				err = err.concat(data.toString());
			});
			proc.on('error', (error) => {
				this.log.err('error:', error);
				reject(error.toString().trim());
			});
			proc.on('close', (code) => {
				if (err.length > 0) {
					this.log.err(`stderr: ${code}\n${err}`);
				}
				this.log.info(`stdout: ${code}\n${out}`);
				if (code != 0) {
					reject(err.trim());
				} else {
					this.log.info('results:', results);
					resolve(results);
				}
			});
		});
	}

	/**
	 * @returns {string}
	 */
	getBuildCmd(): string {
		return this.buildCmd;
	}

	/**
	 * @returns {string}
	 */
	getQueryCmd(): string {
		return this.queryCmd;
	}
}
