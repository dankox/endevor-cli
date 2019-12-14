import { FileUtils } from "./utils/FileUtils";
import { isNullOrUndefined } from "util";
import { HashUtils } from "./utils/HashUtils";
import { EdoCache } from "./EdoCache";
import { IEdoIndex } from "./doc/IEdoIndex";
import { EdoDiffApi } from "./EdoDiffApi";

/**
 * Edo commit api
 */
export class EdoCommitApi {

	/**
	 * Commit changes in working directory to specified stage.
	 *
	 * Commit can be limited to specific files from the array passed to it.
	 * By default, commit is done only on files in the index.
	 * With option `all` commit can be done on added or deleted of files.
	 *
	 * @param stage
	 * @param files
	 * @param all
	 */
	public static async commit(stage: string, files: string[] = [], all: boolean = false) {
		let index: IEdoIndex;
		let oldSha1: string;

		// get index
		if (HashUtils.isSha1(stage)) {
			index = await EdoCache.readIndex(stage);
			oldSha1 = stage;
			stage = index.stgn;
		} else {
			const sha1 = await FileUtils.readRefs(stage);
			if (isNullOrUndefined(sha1)) {
				throw new Error(`Stage ${stage} doesn't exist!`);
			}
			if (!HashUtils.isSha1(sha1)) {
				throw new Error(`Local stage ${stage} doesn't exist! Run 'edo merge'...`);
			}
			oldSha1 = sha1; // save for back reference
			index = await EdoCache.readIndex(sha1);
		}

		// grab differences
		let diffs = await EdoDiffApi.getFileDiff(stage);
		let diffFiles = Object.keys(diffs);
		let updateIndex: boolean = false;
		let mergeIndex: IEdoIndex | null = await EdoCache.readMergeIndex();
		let conflictFiles: string[] = await FileUtils.getConflictFiles();

		// iterate over changes and put them in index
		for (const file of diffFiles) {
			if (files.length > 0 && files.indexOf(file) < 0) continue; // skip files not selected

			// delete
			if (diffs[file][0] == 'null') {
				if (!all) continue; // skip if option 'all' not set
				delete index.elem[file];
				updateIndex = true;
				// remove from conflict files if presented
				const confIdx = conflictFiles.indexOf(file);
				if (confIdx != -1) {
					conflictFiles.splice(confIdx, 1);
				}
				continue;
			}

			// add
			let isAdd: boolean = false;
			if (diffs[file][1] == 'null') {
				if (!all) continue; // skip if option 'all' not set
				isAdd = true;
			}

			// load file from index
			const tmpItem: string[] = index.elem[file];
			const fileBuf: Buffer = await FileUtils.readFile(FileUtils.cwdEdo + file);
			const fileSha1: string = await EdoCache.addSha1Object(fileBuf, EdoCache.OBJ_BLOB);

			// lsha1, rsha1, fingerprint, hsha1, type/element
			if (isAdd) {
				index.elem[file] = [ fileSha1, fileSha1, 'null', 'null', file ];
			} else {
				if (isNullOrUndefined(mergeIndex) || isNullOrUndefined(mergeIndex.elem[file])) {
					index.elem[file] = [ fileSha1, tmpItem[0], tmpItem[2], tmpItem[3], file ];
				} else {
					index.elem[file] = [ fileSha1, tmpItem[0], mergeIndex.elem[file][2], tmpItem[3], file ];
				}
			}
			updateIndex = true;
			// remove from conflict files if presented
			const confIdx = conflictFiles.indexOf(file);
			if (confIdx != -1) {
				conflictFiles.splice(confIdx, 1);
			}
		}

		if (updateIndex) {
			index.prev = oldSha1;
			const indexSha1 = await EdoCache.writeIndex(index);
			if (indexSha1 != null) {
				FileUtils.writeRefs(stage, indexSha1); // update refs
				// if merge files were presented, deal with them
				if (!isNullOrUndefined(mergeIndex) && conflictFiles.length == 0) {
					try {
						await FileUtils.unlink(`${FileUtils.getEdoDir()}/${FileUtils.mergeFile}`);
						await FileUtils.unlink(`${FileUtils.getEdoDir()}/${FileUtils.mergeConflictFile}`);
					} catch (err) {
						console.error(`Error removing merge/conflict files! Do it manually = =`);
					}
				} else if (conflictFiles.length > 0) {
					await FileUtils.writeFile(`${FileUtils.getEdoDir()}/${FileUtils.mergeConflictFile}`, Buffer.from(conflictFiles.join('\n')));
					console.log(`There are still some conflicts remaining. Run 'edo status'...`);
				}
				console.log(`commit ${stage} done!`);
				return;
			}
		}
		console.log(`nothing to commit...`);
	}

}