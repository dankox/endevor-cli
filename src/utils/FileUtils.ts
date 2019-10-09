import * as fs from 'fs';
import * as gfs from 'graceful-fs';
import * as readline from 'readline';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import path from 'path';
import { ISettings } from '../doc/ISettings';
import { isNull, isNullOrUndefined } from 'util';
import { IEleList } from '../doc/IEleList';


function handleResult<T>(resolve: (result: T) => void, reject: (error: Error) => void, error: Error | null | undefined, result: T): void {
	if (error) {
		reject(massageError(error));
	} else {
		resolve(result);
	}
}

function massageError(error: Error & { code?: string }): Error {
	// if (error.code === 'ENOENT') {
	// 	return new Error("File not found!");
	// }

	// if (error.code === 'EISDIR') {
	// 	return new Error("File is a directory!");
	// 	// return vscode.FileSystemError.FileIsADirectory();
	// }

	// if (error.code === 'EEXIST') {
	// 	return new Error("File exists!");
	// 	// return vscode.FileSystemError.FileExists();
	// }

	// if (error.code === 'EPERM' || error.code === 'EACCESS') {
	// 	return new Error("No permissions for access!");
	// 	// return vscode.FileSystemError.NoPermissions();
	// }

	return error;
}


/**
 * File utilities
 */
export class FileUtils {
	static readonly edoDir: string = ".endevor";
	static readonly mapDir: string = "map";
	static readonly configFile: string = "config";
	static readonly stageMapFile: string = "stagemap";
	static readonly sysMapFile: string = "sysmap";
	static readonly subMapFile: string = "submap";
	static readonly index: string = "index";
	static readonly eleBaseIdx: string = "local_base";
	static readonly remote: string = "remote";
	static readonly stageFile: string = "STAGE";

	public static async isNdvDir(): Promise<boolean> {
		return this.exists(this.edoDir);
	}

	/**
	 * Get stage name (env-stgnum-sys-subsys)
	 */
	public static async getStage(): Promise<string> {
		if (!await this.isNdvDir()) {
			console.error("Not endevor repo directory!");
			process.exit(1);
		}
		if (!await this.exists(`${this.edoDir}/${this.stageFile}`)) {
			console.error("Not checked out stage!\nRun 'edo checkout <stage>' first.");
			process.exit(1);
		}

		const buf: Buffer = await this.readfile(`${this.edoDir}/${this.stageFile}`);
		return buf.toString();
	}

	public static async readSettings(): Promise<ISettings> {
		if (!await this.isNdvDir()) {
			console.error("Not endevor repo directory!");
			process.exit(1);
		}
		const buf: Buffer = await this.readfile(this.edoDir + "/" + this.configFile);
		return JSON.parse(buf.toString());
	}

	public static async writeSettings(settings: ISettings): Promise<void> {
		if (!await this.isNdvDir()) {
			await this.mkdir(this.edoDir);
		}
		return this.writefile(this.edoDir + "/" + this.configFile, Buffer.from(JSON.stringify(settings)));
	}

	public static async writeMap(map: any): Promise<void> {
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

		return this.writefile(this.edoDir + "/" + this.stageMapFile, Buffer.from(output));
	}

	public static async writeSysMap(map: any): Promise<void> {
		let output: string = "";
		map.forEach((sys: { envName: any; stgSeqNum: any; sysName: any; nextSys: any; }) => {
			output += `${sys.envName}-${sys.stgSeqNum}-${sys.sysName},${sys.nextSys}\n`;
		});
		output = output.trimRight();

		return this.writefile(this.edoDir + "/" + this.sysMapFile, Buffer.from(output));
	}

	public static async writeSubMap(map: any): Promise<void> {
		let output: string = "";
		await this.rmrf('.map'); // clear location map before creating a new one
		map.forEach((sub: { envName: any; stgSeqNum: any; sysName: any; sbsName: any; nextSbs: any; }) => {
			output += `${sub.envName}-${sub.stgSeqNum}-${sub.sysName}-${sub.sbsName},${sub.nextSbs}\n`;
			this.mkdir(`.map/${sub.envName}-${sub.stgSeqNum}/${sub.sysName}/${sub.sbsName}`);
		});
		output = output.trimRight();

		return this.writefile(this.edoDir + "/" + this.subMapFile, Buffer.from(output));
	}

	public static async writeEleList(filePath: string, eleList: any): Promise<void> {
		// TODO: add check on already presented elements, if fingerprint was changed
		// and according to that either delete remote-sha1 or keep it
		let output: string = "";
		if (!await this.exists(".ele")) {
			await this.mkdir(".ele"); // create directory (just in case)
		}
		if (!isNullOrUndefined(eleList)) {
			eleList.forEach((ele: IEleList) => {
				// output += `${ele.typeName},${ele.fileExt},${ele.fingerprint},sha1,${ele.fullElmName}\n`; // add sha1 when pull
				output += `lsha1,rsha1,${ele.fingerprint},${ele.fileExt},${ele.typeName}-${ele.fullElmName}\n`; // add sha1 when pull
				this.touchfile(`.ele/${ele.fullElmName}.${ele.typeName}`);
				// this.touchfile(`.typ/${ele.typeName}.${ele.fullElmName}`);
			});
			output = output.trimRight();
		}

		return this.writefile(filePath, Buffer.from(output));
	}

	public static generalReadFile(path: string, binary: boolean = false, fileType?: string): Promise<string | Buffer> {
		return new Promise<string | Buffer>((resolve, reject) => {
			fs.readFile(path, (err, data) => {
				if (err) {
					reject(err);
				}
				if (binary) {
					resolve(data);
				} else {
					resolve(data.toString("utf8"));
				}
			});
		});
	}

	/**
	 * Get list of elements from either element file or base element file in stage directory
	 * @param stage
	 * @param base
	 */
	public static async getEleListFromStage(stage: string, base?: boolean): Promise<{ [key: string]: string }> {
		const self = this;
		let eleFile = this.index;
		let keyIdx = 4;
		if (!isNullOrUndefined(base) && base) {
			eleFile = this.eleBaseIdx;
			keyIdx = 2;
		}
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
					const keyVal = self.splitX(line, ',', keyIdx);
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
	 * Get data from CSV file in format key: value, where key is the first
	 * field in the row and value is the second,third,etc...
	 *
	 * @param fileName csv file inside of .endevor directory
	 */
	public static async getDataFromCSV(fileName: string): Promise<{ [key: string]: string }> {
		return new Promise<{ [key: string]: string }>((resolve, reject) => {
			try {
				const fileStream: fs.ReadStream = fs.createReadStream(this.edoDir + "/" + fileName);
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

	public static mkdir(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			mkdirp(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	public static exists(path: string): Promise<boolean> {
		return new Promise<boolean>((resolve, reject) => {
			fs.exists(path, exists => handleResult(resolve, reject, null, exists));
		});
	}

	public static unlink(path: string): Promise<boolean> {
		return new Promise<boolean>((resolve, reject) => {
			fs.unlink(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	public static rmdir(path: string): Promise<boolean> {
		return new Promise<boolean>((resolve, reject) => {
			fs.rmdir(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	public static rmrf(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			rimraf(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	public static async copyFile(src: string, dest: string): Promise<void> {
		let dirName = path.dirname(dest);
		if (!await this.exists(dirName)) {
			await this.mkdir(dirName);
		}

		return new Promise<void>((resolve, reject) => {
			fs.copyFile(src, dest, error => handleResult(resolve, reject, error, void 0));
		});
	}

	public static readdir(path: string): Promise<string[]> {
		return new Promise<string[]>((resolve, reject) => {
			fs.readdir(path, (error, children) => handleResult(resolve, reject, error, children));
		});
	}

	public static stat(path: string): Promise<fs.Stats> {
		return new Promise<fs.Stats>((resolve, reject) => {
			fs.stat(path, (error, stat) => handleResult(resolve, reject, error, stat));
		});
	}

	public static open(path: string, flags: string): Promise<number> {
		return new Promise<number>((resolve, reject) => {
			fs.open(path, flags, (error, fd) => handleResult(resolve, reject, error, fd));
		});
	}

	public static close(fd: number): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.close(fd, (error) => handleResult(resolve, reject, error, void 0));
		});
	}

	public static gfsopen(path: string, flags: string): Promise<number> {
		return new Promise<number>((resolve, reject) => {
			gfs.open(path, flags, (error, fd) => handleResult(resolve, reject, error, fd));
		});
	}

	public static gfsclose(fd: number): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			gfs.close(fd, (error) => handleResult(resolve, reject, error, void 0));
		});
	}

	public static readfile(path: string): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			fs.readFile(path, (error, buffer) => handleResult(resolve, reject, error, buffer));
		});
	}

	public static async writefile(pathStr: string, content: Buffer): Promise<void> {
		let dirName = path.dirname(pathStr);
		if (!await this.exists(dirName)) {
			await this.mkdir(dirName);
		}
		return new Promise<void>((resolve, reject) => {
			fs.writeFile(pathStr, content, error => handleResult(resolve, reject, error, void 0));
		});
	}

	public static async touchfile(path: string) {
		try {
			let fd: number = await this.gfsopen(path, "w");
			await this.gfsclose(fd);
		} catch (err) {
			console.error("touch " + err);
		}
	}

}