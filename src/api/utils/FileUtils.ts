import * as fs from 'fs';
import * as gfs from 'graceful-fs';
import * as readline from 'readline';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import path from 'path';
import os from 'os';
import { ISettings } from '../doc/ISettings';
import { isNull, isNullOrUndefined } from 'util';
import { HashUtils } from './HashUtils';


function handleResult<T>(resolve: (result: T) => void, reject: (error: Error) => void, error: Error | null | undefined, result: T): void {
	if (error) {
		reject(messageError(error));
	} else {
		resolve(result);
	}
}

function messageError(error: Error & { code?: string }): Error {
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
 * Interface for Edo index file
 */
export interface IObject {
	type: string;
	length: number;
	dataOffset: number;
	data: Buffer;
}

/**
 * File utilities
 */
export class FileUtils {
	static readonly edoDir: string = ".edo";
	static readonly objectDir: string = "objects";
	static readonly refsDir: string = "refs";
	static readonly configFile: string = "config";
	static readonly stageMapFile: string = "stagemap";
	static readonly sysMapFile: string = "sysmap";
	static readonly subMapFile: string = "submap";
	// static readonly eleBaseIdx: string = "local_base";
	// static readonly remote: string = "remote";
	static readonly stageFile: string = "STAGE";

	static cwdEdo: string = "./";

	/**
	 * Does .edo directory exists in current directory?
	 */
	public static async isEdoDir(): Promise<boolean> {
		return FileUtils.exists(FileUtils.cwdEdo + FileUtils.edoDir);
	}

	/**
	 * Get .edo directory with root directory prefixed.
	 *
	 * setEdoDir() should be run first, to set path to .edo .
	 * This is useful if you run it inside of directory and
	 * .edo is few directories above.
	 */
	public static getEdoDir(): string {
		return FileUtils.cwdEdo + FileUtils.edoDir;
	}

	/**
	 * Set path to .edo directory.
	 *
	 * Function tries to find .edo directory, if it doesn't
	 * exist it checks directory above, etc.
	 * Until it finds it and set the prefix directory to .edo
	 * (../../)
	 *
	 * Use getEdoDir() to get the actual .edo directory for current run
	 */
	public static async setEdoDir() {
		try {
			if (await FileUtils.isEdoDir()) {
				FileUtils.cwdEdo = path.normalize(FileUtils.cwdEdo); // TODO: check if works properly
				return;
			}
		} catch (err) {
			// error in path, reset to classic
			FileUtils.cwdEdo = "./";
			return;
		}
		FileUtils.cwdEdo += "../";
		FileUtils.setEdoDir();
	}

	/**
	 * Read STAGE and get sha1 for index or name if not existing
	 */
	public static async readStage(): Promise<string> {
		if (!await FileUtils.isEdoDir()) {
			// console.error("Not endevor repo directory!");
			// process.exit(1);
			throw new Error("Not endevor repo directory!");
		}
		if (!await FileUtils.exists(`${FileUtils.getEdoDir()}/${FileUtils.stageFile}`)) {
			// console.error("Not checked out stage!\nRun 'edo checkout <stage>' first.");
			// process.exit(1);
			throw new Error("Not checked out stage!\nRun 'edo checkout <stage>' first.");
		}

		let fileStr: string = (await FileUtils.readFile(`${FileUtils.getEdoDir()}/${FileUtils.stageFile}`)).toString();
		if (fileStr.trim().length == 0) {
			throw new Error("STAGE file compromised! Do checkout to correct.");
		}
		// check if stage checked out by sha1 id
		if (HashUtils.isSha1(fileStr)) {
			return fileStr; // get back the sha1 of stage/index
		}
		// otherwise go to refs and find sha1
		if (await FileUtils.exists(`${FileUtils.getEdoDir()}/${FileUtils.refsDir}/${fileStr}`)) {
			fileStr = (await FileUtils.readFile(`${FileUtils.getEdoDir()}/${FileUtils.refsDir}/${fileStr}`)).toString();
		} else {
			return fileStr; // return just name (no sha1)
		}
		// TODO: fix for tags??? not implemented but tag can point to stage not commit id (for better reference)
		if (HashUtils.isSha1(fileStr)) {
			return fileStr; // get back the sha1 of stage/index
		}
		throw new Error("Stage file doesn't contain sha1 of index! Try different checkout.");
	}

	/**
	 * Read refs file (either location name, or tag) and get sha1 from it
	 *
	 * @param ref
	 */
	public static async readRefs(ref: string): Promise<string | null> {
		if (await FileUtils.exists(`${FileUtils.getEdoDir()}/${FileUtils.refsDir}/${ref}`)) {
			return (await FileUtils.readFile(`${FileUtils.getEdoDir()}/${FileUtils.refsDir}/${ref}`)).toString();
		} else {
			return null;
		}
	}

	/**
	 * Read config file to get settings for Edo.
	 *
	 * This function returns ISettings object, which contains
	 * repository URL and credentials.
	 *
	 * TODO: add some other settings like cmd for difftool, trim whitespace merge, etc.
	 */
	public static async readSettings(): Promise<ISettings> {
		if (!await FileUtils.isEdoDir()) {
			console.error("Not endevor repo directory!");
			process.exit(1);
		}
		const buf: Buffer = await FileUtils.readFile(FileUtils.edoDir + "/" + FileUtils.configFile);
		return JSON.parse(buf.toString());
	}

	/**
	 * Write settings into config file.
	 *
	 * @param settings
	 */
	public static async writeSettings(settings: ISettings): Promise<void> {
		if (!await FileUtils.isEdoDir()) {
			await FileUtils.mkdir(FileUtils.getEdoDir());
		}
		return FileUtils.writeFile(FileUtils.getEdoDir() + "/" + FileUtils.configFile, Buffer.from(JSON.stringify(settings)));
	}

	/**
	 * Read SHA1 file from object directory: .edo/objects/sha1(0,2)/sha1(2,..)
	 *
	 * Read the content and return object with type, length, all data
	 * and offset where actual content starts.
	 *
	 * This is done, so it's possible to verify sha1sum if necessary.
	 * (Maybe this should be done here?)
	 *
	 * @param sha1 file
	 */
	public static async readSha1file(sha1: string): Promise<IObject> {
		let dirName = FileUtils.edoDir + '/' + FileUtils.objectDir + '/' + sha1.substr(0, 2);
		let data: Buffer = await FileUtils.readFile(dirName + '/' + sha1.substring(2));
		return new Promise<IObject>((resolve, reject) => {
			const dataStart: number = data.indexOf('\0');
			if (dataStart < 4) reject(`data compromised, '${sha1}' doesn't look like edo object!`);

			let prefix: string = data.slice(0, dataStart).toString();
			let type: string = prefix.substr(0,4);
			let length: number = parseInt(prefix.substr(5), 10);
			// data = data.slice(dataStart + 1);
			let result: IObject = {
				type: type,
				length: length,
				dataOffset: dataStart + 1, // start after /0
				data: data
			};
			resolve(result);
		});
	}

	/**
	 * Write SHA1 file into object directory in format: .edo/objects/sha1(0,2)/sha1(2,..)
	 *
	 * @param sha1 file
	 * @param content buffer
	 */
	public static async writeSha1file(sha1: string, content: Buffer): Promise<void> {
		let dirName = FileUtils.edoDir + '/' + FileUtils.objectDir + '/' + sha1.substr(0, 2);
		if (!await FileUtils.exists(dirName)) {
			await FileUtils.mkdir(dirName);
		}
		return new Promise<void>((resolve, reject) => {
			fs.writeFile(dirName + '/' + sha1.substring(2), content, error => handleResult(resolve, reject, error, void 0));
		});
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
		if (!await FileUtils.exists(dirName)) {
			await FileUtils.mkdir(dirName);
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

	public static readFile(path: string, trimTrailSpace: boolean = false): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			if (trimTrailSpace) {
				fs.readFile(path, (error, buffer) => {
					if (error) {
						return handleResult(resolve, reject, error, void 0);
					}
					let lines: string[] = buffer.toString().split('\n');
					let output: string[] = [];
					for (let line of lines) {
						output.push(line.trimRight());
					}
					return handleResult(resolve, reject, error, Buffer.from(output.join('\n')));
				});
			} else {
				fs.readFile(path, (error, buffer) => handleResult(resolve, reject, error, buffer));
			}
		});
	}

	public static async writeFile(pathStr: string, content: Buffer): Promise<void> {
		let dirName = path.dirname(pathStr);
		if (!await FileUtils.exists(dirName)) {
			await FileUtils.mkdir(dirName);
		}
		return new Promise<void>((resolve, reject) => {
			fs.writeFile(pathStr, content, error => handleResult(resolve, reject, error, void 0));
		});
	}

	public static async touchFile(path: string) {
		try {
			let fd: number = await FileUtils.gfsopen(path, "w");
			await FileUtils.gfsclose(fd);
		} catch (err) {
			console.error("touch " + err);
		}
	}

	public static async createTempFile(content: Buffer) {
		const name = 'edo-temp-' + Date.now() + '-' + process.pid + '-' + (Math.random() * 10000).toString(36);
		const tmpPath = path.join(path.resolve(os.tmpdir()), name);
		await FileUtils.writeFile(tmpPath, content);
		return tmpPath;
	}

}