import * as fs from 'fs';
import * as gfs from 'graceful-fs';
import * as readline from 'readline';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import path from 'path';
import os from 'os';
import { ISettings } from '../doc/ISettings';
import { FileUtils as fu, IObject } from './utils/FileUtils';
import { isNull, isNullOrUndefined } from 'util';
import { IEdoIndex } from './doc/IEdoIndex';
import { HashUtils } from '../utils/HashUtils';


/**
 * File utilities
 */
export class EdoCache {
	static readonly edoDir: string = ".edo";
	static readonly objectDir: string = "objects";
	static readonly configFile: string = "config";
	static readonly stageMapFile: string = "stagemap";
	static readonly sysMapFile: string = "sysmap";
	static readonly subMapFile: string = "submap";
	static readonly index: string = "index"; // TODO: remove
	static readonly mapDir: string = "map"; // TODO: remove
	// static readonly eleBaseIdx: string = "local_base";
	// static readonly remote: string = "remote";
	static readonly stageFile: string = "STAGE";

	static readonly OBJ_LIST: string = "list";
	static readonly OBJ_BLOB: string = "blob";
	static readonly OBJ_TYPE: string = "type";

	/**
	 * Write index file into edo db (.edo/objects/sha1) and return sha1
	 *
	 * @param index object containing the list, stage name and type list
	 */
	public static async writeIndex(index: IEdoIndex): Promise<string | null> {
		if (isNullOrUndefined(index)) return null;

		let output: string[] = [];
		output.push(`prev ${index.prev}`); // TODO: autoupdate according to current stage
		output.push(`stgn ${index.stgn}`);
		output.push(`type ${index.type}`);

		if (!await fu.exists(".ele")) {
			await fu.mkdir(".ele"); // create directory (just in case)
		}
		if (!isNullOrUndefined(index.elem)) {
			let eles: string[] = Object.keys(index.elem);
			eles.forEach((eleKey: string) => {
				// lsha1,rsha1,fingerprint,hsha1,typeName-fullElmName (new version)
				const elePart = fu.splitX(eleKey, '-', 1);
				output.push(`elem ${index.elem[eleKey]}`);
				fu.touchfile(`.ele/${elePart[1]}.${elePart[0]}`);
			});
		}
		return EdoCache.addSha1Object(Buffer.from(output.join('\n')), EdoCache.OBJ_LIST);
	}

	/**
	 * Get index (list of elements and other meta data) from sha1.
	 *
	 * @param sha1
	 */
	public static async readIndex(sha1: string): Promise<IEdoIndex> {
		let buf: Buffer = await EdoCache.getSha1Object(sha1, EdoCache.OBJ_LIST);
		const data: string[] = buf.toString().split('\n');
		let elem: { [key: string]: string } = {};
		let prev = '0';
		let stgn = '';
		let type = '';
		for (let line in data) {
			if (line.startsWith("elem ")) {
				// lsha1,rsha1,fingerprint,??print??,typeName-fullElmName
				const keyVal = fu.splitX(line, ',', 4);
				elem[keyVal[4]] = keyVal.join(',');
			} else if (line.startsWith("prev ")) {
				prev = line.substring(5).trimRight();
			} else if (line.startsWith("stgn ")) {
				stgn = line.substring(5).trimRight();
			} else if (line.startsWith("type ")) {
				type = line.substring(5).trimRight();
			}
		}
		return { prev: prev, stgn: stgn, type: type, elem: elem };
	}

	/**
	 * Get list of elements from either element file or base element file in stage directory
	 * @param stage
	 * @param base
	 */
	public static async getEleListFromStage(stage: string): Promise<{ [key: string]: string }> {
		const self = this;
		let eleFile = this.index;
		let keyIdx = 4;
		return new Promise<{ [key: string]: string }>((resolve, reject) => {
			try {
				const fileStream: fs.ReadStream = fs.createReadStream(this.edoDir + "/" + this.mapDir + "/" + stage + "/" + eleFile);
				fileStream.on('error', err => {
					reject(err);
				});
				const rl = readline.createInterface({
					input: fileStream,
					crlfDelay: Infinity
				});
				let data: { [key: string]: string } = {};
				rl.on('line', (line) => {
					// lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName
					// sha1,fingerprint,typeName-fullElmName
					const keyVal = fu.splitX(line, ',', keyIdx);
					data[keyVal[keyIdx]] = keyVal.join(',');
				}).on('error', (err) => {
					reject(err);
				}).on('close', () => {
					resolve(data);
				});
			} catch (err) {
				reject(err);
			}

		});
	}

	/**
	 * Get SHA1 object from the db (.edo/objects/sha1...)
	 *
	 * @param sha1 object
	 * @param type type of data to verify
	 * @returns Buffer with data from object
	 */
	public static async getSha1Object(sha1: string, type?: string): Promise<Buffer> {
		const obj: IObject = await fu.readSha1file(sha1);
		if (sha1 != HashUtils.getHash(obj.data)
			|| (obj.length + obj.dataOffset + 1) == obj.data.length) {
			throw Error("incorrect sha1 checksum... corrupted data!!!");
		}
		if (!isNullOrUndefined(type) && obj.type != type) {
			throw Error(`not '${type}' type doesn't match!`);
		}
		return obj.data.slice(obj.dataOffset);
	}

	/**
	 * Add SHA1 object into the db (.edo/objects/sha1...)
	 *
	 * @param data content
	 * @param type type of data
	 * @returns sha1 of newly created object
	 */
	public static async addSha1Object(data: Buffer, type: string): Promise<string> {
		const buf: Buffer = EdoCache.createObjectBuffer(data, type);
		const sha1 = HashUtils.getHash(buf);
		await fu.writeSha1file(sha1, buf);
		return sha1;
	}

	/**
	 * Create object Buffer from data buffer and type
	 *
	 * Output version of Buffer contains prefix with type of data
	 * and length of data
	 * @param buf content
	 * @param type of data (list, blob, type)
	 */
	public static createObjectBuffer(buf: Buffer, type: string): Buffer {
		const prefixStr: string = type + ' ' + buf.length + '\0';
		const prefBuf: Buffer = Buffer.from(prefixStr);
		const tmpBuf: Buffer = Buffer.alloc(prefBuf.length + buf.length);
		prefBuf.copy(tmpBuf);
		buf.copy(tmpBuf, prefBuf.length);
		return tmpBuf;
	}

}

// Test
// let buf: Buffer = EdoCache.getObjectBuffer(Buffer.from("Hello World!\n how are you ;) \n"), EdoCache.OBJ_BLOB);
// console.log(buf.toString('hex'));
// console.log(buf.toString());