import { IObject, FileUtils } from './utils/FileUtils';
import { isNullOrUndefined } from 'util';
import { IEdoIndex } from './doc/IEdoIndex';
import { HashUtils } from './utils/HashUtils';
import { CsvUtils } from './utils/CsvUtils';


/**
 * Edo Cache utility class. Handling Edo database access:
 *
 * - write/read of index files
 * - write/read of sha1 objects of types
 * - check if sha1 object exists in databse
 */
export class EdoCache {
	static readonly OBJ_LIST: string = "list";
	static readonly OBJ_BLOB: string = "blob";
	static readonly OBJ_LOGS: string = "logs";
	static readonly OBJ_TYPE: string = "type";

	/**
	 * Write index file into edo db `.edo/objects/sha1` and return sha1.
	 *
	 * Removed!!! ->During run, creates helper for element names in `.ele/` directory.
	 *
	 * @param index object containing the list, stage name and type list
	 * @returns sha1 of stored index or null if index is null
	 */
	public static async writeIndex(index: IEdoIndex): Promise<string | null> {
		if (isNullOrUndefined(index)) return null;

		let output: string[] = [];
		output.push(`prev ${index.prev}`); // TODO: autoupdate according to current stage
		output.push(`stgn ${index.stgn}`);
		output.push(`stat ${index.stat}`);
		output.push(`mesg ${index.mesg}`);
		output.push(`type ${index.type}`);

		// TODO: create helper, screw this (we don't fetch all anyway)
		// if (!await FileUtils.exists(".ele")) {
		// 	await FileUtils.mkdir(".ele"); // create directory (just in case)
		// }
		if (!isNullOrUndefined(index.elem)) {
			let eles: string[] = Object.keys(index.elem);
			eles.forEach((eleKey: string) => {
				// lsha1,rsha1,fingerprint,hsha1,typeName-fullElmName (new version)
				const elePart = CsvUtils.splitX(eleKey, FileUtils.separator, 1);
				// check if there is no additional data from different processing, if so remove
				while (index.elem[eleKey].length > 5) {
					index.elem[eleKey].pop();
				}
				output.push(`elem ${index.elem[eleKey].join(',')}`);
				// FileUtils.touchFile(`.ele/${elePart[1]}.${elePart[0]}`);
			});
		}
		return EdoCache.addSha1Object(Buffer.from(output.join('\n')), EdoCache.OBJ_LIST);
	}

	/**
	 * Get index (list of elements and other meta data) for specified stage.
	 *
	 * @param stage name or sha1 of index
	 */
	public static async readIndex(stage: string): Promise<IEdoIndex> {
		// TODO: search for stage sha1, update all calls to this function for readability improvement
		if (!HashUtils.isSha1(stage)) {
			const sha1 = await FileUtils.readRefs(stage);
			if (isNullOrUndefined(sha1)) {
				throw new Error(`Stage ${stage} doesn't have index!`);
			}
			stage = sha1;
		}

		let buf: Buffer = await EdoCache.getSha1Object(stage, EdoCache.OBJ_LIST);
		const data: string[] = buf.toString().split('\n');
		let elem: { [key: string]: string[] } = {};
		let prev = 'null';
		let stgn = '';
		let stat = '';
		let mesg = '';
		let type = '';
		for (const line of data) {
			if (line.startsWith("elem ")) {
				// lsha1,rsha1,fingerprint,??print??,typeName-fullElmName
				const keyVal = CsvUtils.splitX(line.substring(5).trimRight(), ',', 4);
				elem[keyVal[4]] = keyVal;
			} else if (line.startsWith("prev ")) {
				prev = line.substring(5).trimRight();
			} else if (line.startsWith("stgn ")) {
				stgn = line.substring(5).trimRight();
			} else if (line.startsWith("stat ")) {
				stat = line.substring(5).trimRight();
			} else if (line.startsWith("mesg ")) {
				mesg = line.substring(5).trimRight();
			} else if (line.startsWith("type ")) {
				type = line.substring(5).trimRight();
			}
		}
		return { prev: prev, stgn: stgn, stat: stat, mesg: mesg, type: type, elem: elem };
	}

	/**
	 * Get index of stage which was merged (a.k.a remote stage) into working directory.
	 * @returns either `null` if no stage was merged, or `IEdoIndex`
	 */
	public static async readMergeIndex(): Promise<IEdoIndex | null> {
		if (await FileUtils.exists(`${FileUtils.getEdoDir()}/${FileUtils.mergeFile}`)) {
			try {
				const mergeSha1 = (await FileUtils.readFile(`${FileUtils.getEdoDir()}/${FileUtils.mergeFile}`)).toString().trim();
				return EdoCache.readIndex(mergeSha1);
			} catch (err) {
				// If error, don't care, just won't update fingerprint
			}
		}
		return null;
	}

	/**
	 * Read types from sha1 identifier. Returns indexable object where index is `typeName` and
	 * value is array with 2 items.
	 *
	 * 1st - T or B (text or binary)
	 *
	 * 2nd - number (record length for the type)
	 *
	 * @param sha1 id of type object
	 * @returns indexable object, format like: `types['typeName'] = [ 'T', '80' ]`
	 */
	public static async readTypes(sha1: string): Promise<{[key: string]: string[]}> {
		//let types: string[] = [];
		const types: string[] = (await EdoCache.getSha1Object(sha1, EdoCache.OBJ_TYPE)).toString().split('\n');
		let data: { [key: string]: string[] } = {};
		for (const line of types) {
			const keyVal = line.match(/([^,]+),([^,]+),([^,]+)/);
			if (keyVal != null) {
				data[keyVal[1]] = [ keyVal[2], keyVal[3] ];
			}
		}
		return data;
	}

	/**
	 * Get index from history which is `backref` number from last index.
	 *
	 * Basically you will get index which is `backref` commit behind.
	 *
	 * @param stage name or sha1 which is starting point
	 * @param backref number of times to go thru `index.prev`
	 * @returns IEdoIndex
	 */
	public static async getIndex(stage: string, backref: number): Promise<IEdoIndex> {
		let indexSha1: string = stage;
		let index: IEdoIndex;

		if (!HashUtils.isSha1(stage)) {
			const sha1 = await FileUtils.readRefs(stage);
			if (isNullOrUndefined(sha1)) {
				throw new Error(`Stage ${stage} doesn't have index!`);
			}
			indexSha1 = sha1;
		}

		// get index
		index = await EdoCache.readIndex(indexSha1);

		// loop back thru index.prev to get to the correct index
		for (let i = 0; i < backref; i++) {
			if (index.prev != 'null' && (await EdoCache.sha1Exists(index.prev))) {
				index = await EdoCache.readIndex(index.prev);
			} else {
				if ( (i + 1) == backref) {
					index.prev = 'base'; // set to base in case sha1 doesn't exist (because of gc)
					break; // if we are
				}
				throw new Error(`Invalid object name ${stage}~${backref}`);
			}
		}
		return index;
	}

	public static async getLogs(stage: string, file: string) {
		let index: IEdoIndex;
		try {
			index = await EdoCache.readIndex(stage);
		} catch (err) {
			throw new Error(`Stage ${stage} doesn't have index! (run 'edo fetch ${stage}')`);
		}
		if (isNullOrUndefined(index.elem[file])){
			throw new Error(`File ${file} doesn't exist in ${stage}! (run 'edo fetch ${stage} ${file}')`);
		}
		if (!HashUtils.isSha1(index.elem[file][3])) {
			const hint = stage.startsWith('remote/') ?
				`\n    (use 'edo fetch -l ${stage} ${file}' to get logs)` :
				`\n    (use 'edo fetch -l remote/${stage} ${file}' to run it against remote stage)`;
			throw new Error(`File ${file} doesn't have history log in ${stage}!${hint}`);
		}
		let buf: Buffer = await EdoCache.getSha1Object(index.elem[file][3], EdoCache.OBJ_LOGS);
		return EdoCache.extractLogDetails(buf);
	}

	public static async getLogsContent(stage: string, file: string, vvll: string, details: boolean = false) {
		let index: IEdoIndex;
		try {
			index = await EdoCache.readIndex(stage);
		} catch (err) {
			throw new Error(`Stage ${stage} doesn't have index! (run 'edo fetch ${stage}')`);
		}
		if (isNullOrUndefined(index.elem[file])){
			throw new Error(`File ${file} doesn't exist in ${stage}! (run 'edo fetch ${stage} ${file}')`);
		}
		if (!HashUtils.isSha1(index.elem[file][3])) {
			const hint = stage.startsWith('remote/') ?
				`\n    (use 'edo fetch -l ${stage} ${file}' to get logs)` :
				`\n    (use 'edo fetch -l remote/${stage} ${file}' to run it against remote stage)`;
			throw new Error(`File ${file} doesn't have history log in ${stage}!${hint}`);
		}
		let buf: Buffer = await EdoCache.getSha1Object(index.elem[file][3], EdoCache.OBJ_LOGS);
		let logs = EdoCache.extractLogDetails(buf);

		if (!isNullOrUndefined(logs[vvll])) {
			return EdoCache.extractLogContent(buf, vvll, details);
		} else {
			throw new Error(`Incorrect change specified '${vvll}'! (run 'edo show -l ${stage}:${file}' to list available changes)`);
		}
	}

	public static extractLogDetails(logBuf: Buffer): {[key: string]: string[]} {
		let lines: string[] = logBuf.toString().split('\n');
		let logDetails: {[key: string]: string[]} = {};
		for (let line of lines) {
			if (line[2] == ' ' && line.slice(3,7).match(/^\d+$/)) {
				const vvll = line.slice(3, 7);
				const user = line.slice(13, 21);
				const date = line.slice(22, 35);
				const ccid = line.slice(45, 57);
				const comment = line.slice(58);
				logDetails[vvll] = [ vvll, user, date, ccid, comment ];
			} else if (line[2] == '+') {
				break;
			}
		}
		return logDetails;
	}

	public static extractLogContent(logBuf: Buffer, vvll: string, details: boolean = false) {
		let lines: string[] = logBuf.toString().split('\n');
		let output: string[] = [];
		let foundDetail: boolean = false;
		for (let line of lines) {
			if (!foundDetail && line[2] == ' ') {
				if (line.slice(3, 7) == vvll) {
					foundDetail = true;
				}
			} else if (line[2] == '+') {
				if (line.slice(3, 7) > vvll) continue;
				if (line[7] == '-' && line.slice(8, 12) <= vvll) continue;
				if (details) {
					output.push(line.slice(3, 7) + " " + line.slice(13));
				} else {
					output.push(line.slice(13));
				}
			}
		}
		return Buffer.from(output.join('\n'));
	}

	/**
	 * Get list of files in format `typeName/eleName` from provided index.
	 *
	 * Files can be filtered by using filter parameter in format `key=value`, where key
	 * can be one of the following: lsha1, rsha1, fingerprint, logs.
	 *
	 * Example of filter `fingerprint=null` will return list of files which has
	 * null fingerprint.
	 *
	 * @param index IEdoIndex
	 * @param filter used to filter files (e.g. `fingerprint=null`)
	 */
	public static getFiles(index: IEdoIndex, filter?: string): string[] {
		let eles: string[][] = Object.values(index.elem);
		let filterKey = 2; // default fingerprint filter
		let filterValue = 'null'; // default if null returns
		if (!isNullOrUndefined(filter)) {
			const tmpFil = filter.split("=");
			if (tmpFil[0] == 'lsha1') {
				filterKey = 0;
			} else if (tmpFil[0] == 'rsha1') {
				filterKey = 1;
			} else if (tmpFil[0] == 'fingerprint') {
					filterKey = 2;
			} else if (tmpFil[0] == 'logs') {
					filterKey = 3;
			}
			filterValue = tmpFil[1];
		}

		let files: string[] = [];
		for (const line of eles) {
			if (!isNullOrUndefined(filter)) {
				if (line[filterKey] == filterValue) {
					files.push(line[4]);
				}
			} else {
				files.push(line[4]);
			}
		}
		return files;
	}

	/**
	 * Get SHA1 object from the db (.edo/objects/sha1...)
	 *
	 * @param sha1 object
	 * @param type type of data to verify
	 * @returns Buffer with data from object
	 */
	public static async getSha1Object(sha1: string, type?: string): Promise<Buffer> {
		const obj: IObject = await FileUtils.readSha1file(sha1);
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
		await FileUtils.writeSha1file(sha1, buf);
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

	/**
	 * Check Edo db for sha1 object, if it exists.
	 *
	 * @param sha1 object
	 */
	public static async sha1Exists(sha1: string): Promise<boolean> {
		let dirName = FileUtils.getEdoDir() + '/' + FileUtils.objectDir + '/' + sha1.substr(0, 2);
		return FileUtils.exists(dirName + '/' + sha1.substring(2));
	}

}
