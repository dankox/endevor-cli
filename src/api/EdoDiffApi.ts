import { FileUtils } from "./utils/FileUtils";
import { isNullOrUndefined } from "util";
import { HashUtils } from "./utils/HashUtils";
import * as jsdiff from "diff";
import { IEdoIndex } from "./doc/IEdoIndex";
import { EdoCache } from "./EdoCache";
import { MergeUtils } from "./utils/MergeUtils";

/**
 * Endevor restore working directory to local or remote (like discard)
 */
export class EdoDiffApi {

	/**
	 * Diff the file.
	 *
	 * Diff happens either on file in working directory and Edo database sha1 file, or between
	 * two sha1 files in database.
	 *
	 * Files are used from the array, where first file is new and second is old.
	 *
	 * If the value is `null`, it doesn't exist.
	 * If it is `file` it's working directory file. Otherwise it is `sha1`.
	 *
	 * @param file name in format `type/element`
	 * @param whatToDiff array from `getxxxDiff()` functions in format `[ 'new', 'old' ]`
	 * @param ignoreWhiteSpace ignore white space? Default is `true` for ignoring
	 * @returns patch as array of lines
	 */
	public static async diff(file: string, whatToDiff: string[], ignoreWhiteSpace: boolean = true): Promise<string[]> {
		let output: string[] = [];
		if (whatToDiff[1] == 'null' || whatToDiff[0] == 'null') {
			// TODO: should return full file???
			// for no diff, because other doesn't exists, don't return
			return [];
		}
		let oldBuf: string;
		let newBuf: string;

		if (whatToDiff[0] == 'file') {
			newBuf = (await FileUtils.readFile(FileUtils.cwdEdo + file)).toString();
		} else {
			newBuf = (await EdoCache.getSha1Object(whatToDiff[0], EdoCache.OBJ_BLOB)).toString();
			if (ignoreWhiteSpace) newBuf = MergeUtils.trimTrailSpace(newBuf);
		}
		if (whatToDiff[1] == 'file') {
			oldBuf = (await FileUtils.readFile(FileUtils.cwdEdo + file)).toString();
		} else {
			oldBuf = (await EdoCache.getSha1Object(whatToDiff[1], EdoCache.OBJ_BLOB)).toString();
			if (ignoreWhiteSpace) oldBuf = MergeUtils.trimTrailSpace(oldBuf);
		}
		if (oldBuf == newBuf) return [];

		output.push(...jsdiff.createTwoFilesPatch(`a/${file}`, `b/${file}`, oldBuf, newBuf, '', '', { ignoreWhitespace: ignoreWhiteSpace }).split('\n'));
		// TODO: check this, to provide hunks and lines numbers for better reference
		// let parse: jsdiff.ParsedDiff = jsdiff.structuredPatch(`a/${file}`, `b/${file}`, oldBuf, newBuf, '', '', { ignoreWhitespace: true });
		return output;
	}

	/**
	 * Get a list of files with differences between working directory and last changes in stage.
	 * If `base` specified, compare with base from stage.
	 *
	 * Each file has two items, new version and old version.
	 * If that file doesn't exist in new or old version, it is referenced as `null`.
	 * If the file is in Edo database, it has sha1 reference. If it's work directory file, it has
	 * keyword `file` specified.
	 *
	 * @param stage name or sha1 of stage to compare with
	 * @param base specify if diff should compare with base changes or last changes.
	 * If set to `true` compare with base changes, if `false` compare with last changes.
	 * Default is `false`
	 * @returns
	 * Example of output:
	 * for diff between stages
	 * ```
	 * {
	 * "type/elem1": [ 'new-sha1', 'old-sha1' ],
	 * "type/elem2": [ 'null', 'old-sha1' ],
	 * "type/elem3": [ 'new-sha1', 'null' ]
	 * }
	 * ```
	 * for diff between working directory and stage
	 * ```
	 * {
	 * "type/elem1": [ 'file', 'old-sha1' ],
	 * "type/elem2": [ 'null', 'old-sha1' ],
	 * "type/elem3": [ 'file', 'null' ]
	 * }
	 * ```
	 */
	public static async getFileDiff(stage: string, base: boolean = false) {
		let index: IEdoIndex | null = null;

		// if sha1, grab stage name from index file (for both new and old)
		if (HashUtils.isSha1(stage)) {
			index = await EdoCache.readIndex(stage);
			stage = index.stgn;
		} else {
			const sha1 = await FileUtils.readRefs(stage);
			if (isNullOrUndefined(sha1)) {
				throw new Error(`Stage ${stage} doesn't exist!`);
			}
			index = await EdoCache.readIndex(sha1);
		}

		// diff index with working directory
		let diffs: {[key: string]: string[]} = {};
		const typeDirs: string[] = Object.keys(await EdoCache.readTypes(index.type));
		const wdFiles: string[] = await FileUtils.listRepoDirs(typeDirs);
		const uniqKeys = [...new Set([...Object.keys(index.elem), ...wdFiles])];

		for (const key of uniqKeys) {
			if (wdFiles.indexOf(key) == -1) {
				diffs[key] = [ 'null', index.elem[key][0] ];
				continue;
			}
			if (isNullOrUndefined(index.elem[key])) {
				diffs[key] = [ 'file', 'null' ];
				continue;
			}
			const fsha1 = await HashUtils.getEdoFileHash(FileUtils.cwdEdo + key);
			if (base) {
				if (index.elem[key][1] != fsha1) {
					diffs[key] = [ 'file', index.elem[key][1] ];
				}
			} else {
				if (index.elem[key][0] != fsha1) {
					diffs[key] = [ 'file', index.elem[key][0] ];
				}
			}
		}
		return diffs;
	}

	/**
	 * Diffs two indexes and returns object with key for each difference in the files in them and value with SHA1s.
	 * If second index is not specified, diffs only versions inside of one index (latest vs. base version).
	 *
	 * If file doesn't exist in one of the indexes, the returned value for that index will be `null`.
	 *
	 * @param newIndex the "new" index which should be applied on old version
	 * @param oldIndex the "old" index to compare new one with [optional]
	 * @param base specify if diff should compare with base from `oldIndex` or not (default `false`)
	 * @returns
	 * Example of output:
	 * ```
	 * {
	 * "type/elem1": [ 'new-sha1', 'old-sha1' ],
	 * "type/elem2": [ 'null', 'old-sha1' ],
	 * "type/elem3": [ 'new-sha1', 'null' ]
	 * }
	 * ```
	 */
	public static getIndexDiff(newIndex: IEdoIndex, oldIndex?: IEdoIndex, base: boolean = false): {[key: string]: string[]} {
		let uniqKeys: string[] = [];
		let diffBase: boolean = false;
		if (isNullOrUndefined(oldIndex)) {
			oldIndex = newIndex; // just fake
			uniqKeys = Object.keys(newIndex.elem);
			diffBase = true;
		} else {
			uniqKeys = [...new Set([...Object.keys(newIndex.elem), ...Object.keys(oldIndex.elem)])];
		}

		let diffs: {[key: string]: string[]} = {};
		for (const key of uniqKeys) {
			if (isNullOrUndefined(oldIndex.elem[key])) {
				diffs[key] = [ newIndex.elem[key][0], 'null' ];
				continue;
			}
			if (isNullOrUndefined(newIndex.elem[key])) {
				diffs[key] = [ 'null', oldIndex.elem[key][0] ];
				continue;
			}
			// for diff inside of index (lsha1 vs. rsha1)
			if (diffBase) {
				if (newIndex.elem[key][0] != newIndex.elem[key][1]) {
					diffs[key] = [ newIndex.elem[key][0], newIndex.elem[key][1] ];
				}
			} else {
				if (base) {
					if (newIndex.elem[key][0] != oldIndex.elem[key][1]) {
						diffs[key] = [ newIndex.elem[key][0], oldIndex.elem[key][1] ];
					}
				} else {
					if (newIndex.elem[key][0] != oldIndex.elem[key][0]) {
						diffs[key] = [ newIndex.elem[key][0], oldIndex.elem[key][0] ];
					}
				}
			}
		}
		return diffs;
	}

	/**
	 * Diff fingerprints in two indexes for common files.
	 *
	 * Returns back only files which have different fingerprints. Don't include files which don't
	 * exist in one or the other index.
	 *
	 * @param localIndex IEdoIndex for comparision
	 * @param remoteIndex IEdoIndex for comparision
	 * @returns array of files in format `[ 'type/element1', 'type/element2' ]`
	 */
	public static diffIndexFinger(localIndex: IEdoIndex, remoteIndex: IEdoIndex): string[] {
		const uniqKeys = [...new Set([...Object.keys(localIndex.elem), ...Object.keys(remoteIndex.elem)])];

		let diffs: string[] = [];
		for (const key of uniqKeys) {
			if (isNullOrUndefined(remoteIndex.elem[key])) {
				continue;
			}
			if (isNullOrUndefined(localIndex.elem[key])) {
				continue;
			}
			if (localIndex.elem[key][2] != remoteIndex.elem[key][2]) {
				diffs.push(key);
			}
		}
		return diffs;
	}

}
