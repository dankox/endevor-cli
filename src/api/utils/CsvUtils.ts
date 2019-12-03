import * as fs from 'fs';
import * as readline from 'readline';
import { isNull } from 'util';
import { FileUtils } from './FileUtils';
import { HashUtils } from './HashUtils';
import { EdoCache } from '../EdoCache';


/**
 * CSV utilities for dealing with maps, element/type lists or generic csv data
 */
export class CsvUtils {

	/**
	 * Get map in array format, where first item is starting stage and
	 * second is the next stage/subsystem, etc.
	 *
	 * If any error occurs, function will return empty map.
	 *
	 * @param startStage starting stage/subsystem (can be name or sha1)
	 * @returns array of stage/subsystem location in map order
	 */
	public static async getMapArray(startStage: string): Promise<string[]> {
		// check if stage is sha1? if so, get stage name from index
		if (HashUtils.isSha1(startStage)) {
			const index = await EdoCache.readIndex(startStage);
			startStage = index.stgn;
		}

		let mapArray: string[] = [];
		mapArray.push(startStage);

		try {
			let subMap = await CsvUtils.getDataFromCSV(FileUtils.subMapFile);
			let stage = subMap[startStage].split(',')[0];
			while (!stage.startsWith("0-0")) {
				mapArray.push(stage);
				stage = subMap[stage].split(',')[0];
			}
		} catch (err) {
			// either startStage doesn't exist in submap, or problem while reading file
			console.error("error while creating map array!");
			return [];
		}
		return mapArray;
	}

	/**
	 * Write stage map into a file in csv format
	 *
	 * @param map list of stages from rest api
	 */
	public static async writeStageMap(map: any): Promise<void> {
		let output: string = "";
		map.forEach((stage: { envName: any; stgNum: any; nextEnv: any; nextStgNum: any; entryStg: any; }) => {
			if (isNull(stage.nextEnv)) stage.nextEnv = "0";
			if (isNull(stage.nextStgNum)) stage.nextStgNum = "0";
			if (stage.entryStg)
				stage.entryStg = "1";
			else
				stage.entryStg = "0";

			output += `${stage.envName}-${stage.stgNum},${stage.nextEnv}-${stage.nextStgNum},${stage.entryStg}\n`;
		});
		output = output.trimRight();

		return FileUtils.writeFile(FileUtils.getEdoDir() + "/" + FileUtils.stageMapFile, Buffer.from(output));
	}

	/**
	 * Write system map into a file in csv format
	 *
	 * @param map list of system from rest api
	 */
	public static async writeSysMap(map: any): Promise<void> {
		let output: string = "";
		map.forEach((sys: { envName: any; stgSeqNum: any; sysName: any; nextSys: any; }) => {
			output += `${sys.envName}-${sys.stgSeqNum}-${sys.sysName},${sys.nextSys}\n`;
		});
		output = output.trimRight();

		return FileUtils.writeFile(FileUtils.getEdoDir() + "/" + FileUtils.sysMapFile, Buffer.from(output));
	}

	/**
	 * Write subsystem map into a file in csv format
	 *
	 * @param map list of subsystem from rest api
	 */
	public static async writeSubMap(map: any): Promise<void> {
		let output: string = "";
		await FileUtils.rmrf('.map'); // clear location map before creating a new one
		map.forEach((sub: { envName: any; stgSeqNum: any; sysName: any; sbsName: any; nextSbs: any; }) => {
			output += `${sub.envName}-${sub.stgSeqNum}-${sub.sysName}-${sub.sbsName},${sub.nextSbs}\n`;
			FileUtils.mkdir(`.map/${sub.envName}-${sub.stgSeqNum}/${sub.sysName}/${sub.sbsName}`);
		});
		output = output.trimRight();

		return FileUtils.writeFile(FileUtils.getEdoDir() + "/" + FileUtils.subMapFile, Buffer.from(output));
	}

	/**
	 * Get data from CSV file in format key: value, where key is the first
	 * field in the row and value is the second,third,etc...
	 *
	 * @param fileName csv file inside of .edo directory
	 */
	public static async getDataFromCSV(fileName: string): Promise<{ [key: string]: string }> {
		return new Promise<{ [key: string]: string }>((resolve, reject) => {
			try {
				const fileStream: fs.ReadStream = fs.createReadStream(FileUtils.getEdoDir() + "/" + fileName);
				const rl = readline.createInterface({
					input: fileStream,
					crlfDelay: Infinity
				});
				let data: { [key: string]: string } = {};
				rl.on('line', (line) => {
					const keyVal = line.match(/([^,]+),(.+)/);
					if (keyVal != null) {
						data[keyVal[1]] = keyVal[2];
					}
				}).on('close', () => {
					resolve(data);
				});
			} catch (err) {
				reject(err);
			}
		});
	}

	/**
	 * Get data for specific key from CSV file as string in format:
	 * value = second-field,third-field,etc...
	 *
	 * example: line in subsystem map `dev-1-sys-sub,dev-2-sys-sub,1`
	 * requested key `dev-1-sys-sub`, returned value `dev-2-sys-sub,1`
	 *
	 * @param fileName csv file inside of .edo directory
	 */
	public static async getKeyFromCSV(fileName: string, key: string): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			try {
				const fileStream: fs.ReadStream = fs.createReadStream(FileUtils.getEdoDir() + "/" + fileName);
				const rl = readline.createInterface({
					input: fileStream,
					crlfDelay: Infinity
				});
				// let data: { [key: string]: string } = {};
				rl.on('line', (line) => {
					const keyVal = line.match(/([^,]+),(.+)/);
					if (keyVal != null && keyVal[1] == key) {
						resolve(keyVal[2]);
					}
				}).on('close', () => {
					reject('key not found!');
				});
			} catch (err) {
				reject(err);
			}
		});
	}

	/**
	 * Get file path from index line
	 *
	 * @param line from index file `Object.values(IEdoIndex.elem)`
	 */
	public static getFilePath(line: string): string {
		let tmpItem = CsvUtils.splitX(line, ',', 4);  // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName
		let eleParts = CsvUtils.splitX(tmpItem[4], '-', 1);
		let file = `./${eleParts[0]}/${eleParts[1]}`;
		return file;
	}

	/**
	 * Get fingerprint from index line
	 *
	 * @param line from index file `Object.values(IEdoIndex.elem)`
	 */
	public static getFingerprint(line: string): string {
		let tmpItem = CsvUtils.splitX(line, ',', 4);  // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName
		return tmpItem[2];
	}

	/**
	 * Set fingerprint to index line
	 *
	 * @param line from index file `Object.values(IEdoIndex.elem)`
	 * @param fingerprint new fingerprint which will be replaced in the index line
	 */
	public static setFingerprint(line: string, fingerprint: string): string {
		let tmpItem = CsvUtils.splitX(line, ',', 4);  // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName
		tmpItem[2] = fingerprint;
		return tmpItem.join(',');
	}

	/**
	 * Get current sha1 from index line.
	 *
	 * Current means the latest one, if there is local, it returns local.
	 * If there isn't local, it returns remote, or null
	 *
	 * @param line from index file `Object.values(IEdoIndex.elem)`
	 */
	public static getCurrentSha1(line: string): string | null {
		let tmpItem = CsvUtils.splitX(line, ',', 4);  // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName
		if (tmpItem[0] != 'lsha1') { // get latest local version (if exists)
			return tmpItem[0];
		} else if (tmpItem[1] != 'rsha1') { // if not, get remote version (if exists)
			return tmpItem[1];
		}
		// if doesn't exists, return null
		return null;
	}

	/**
	 * Get local sha1 from index line.
	 *
	 * If there is no local sha1, will return null
	 *
	 * @param line from index file `Object.values(IEdoIndex.elem)`
	 */
	public static getLocalSha1(line: string): string | null {
		let tmpItem = CsvUtils.splitX(line, ',', 4);  // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName
		if (tmpItem[0] != 'lsha1') { // get latest local version (if exists)
			return tmpItem[0];
		} else if (tmpItem[1] != 'rsha1') { // if not, get remote version (if exists)
			return tmpItem[1];
		}
		// if doesn't exists, return null
		return null;
	}

	/**
	 * Get file path from index line.
	 *
	 * If there is no local sha1, will return null
	 *
	 * @param line from index file `Object.values(IEdoIndex.elem)`
	 */
	public static getRemoteSha1(line: string): string | null {
		let tmpItem = CsvUtils.splitX(line, ',', 4);  // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName
		if (tmpItem[0] != 'lsha1') { // get latest local version (if exists)
			return tmpItem[0];
		} else if (tmpItem[1] != 'rsha1') { // if not, get remote version (if exists)
			return tmpItem[1];
		}
		// if doesn't exists, return null
		return null;
	}

	/**
	 * Split string n-times into array, with delimiter specified.
	 *
	 * Delimiter will be used n-times (count) to split the text.
	 *
	 * e.g: "test,hej,bla,bla" with 2 as count will be split
	 * into ['test', 'hej', 'bla,bla']
	 *
	 * @param str text to split
	 * @param delim delimiter to use for split
	 * @param count number of split occuring on the text
	 */
	public static splitX(str: string, delim: string, count: number) {
		let arr = str.split(delim);
		let result = arr.splice(0, count);
		result.push(arr.join(delim));
		return result;
	}

}