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

		// iterate over changes and put them in index
		for (const file of diffFiles) {
			if (files.length > 0 && files.indexOf(file) < 0) continue; // skip files not selected

			// delete
			if (diffs[file][0] == 'null') {
				if (!all) continue; // skip if option 'all' not set
				delete index.elem[file];
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
				index.elem[file] = [ fileSha1, tmpItem[0], tmpItem[2], tmpItem[3], file ];
			}
			updateIndex = true;
		}

		if (updateIndex) {
			index.prev = oldSha1;
			const indexSha1 = await EdoCache.writeIndex(index);
			if (indexSha1 != null) {
				FileUtils.writeRefs(stage, indexSha1); // update refs
				console.log(`commit ${stage} done!`);
				return;
			}
		}
		console.log(`nothing to commit...`);
	}

}