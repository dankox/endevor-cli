import { FileUtils } from "./utils/FileUtils";
import { isNullOrUndefined } from "util";
import { HashUtils } from "./utils/HashUtils";
import { EdoCache } from "./EdoCache";
import { IEdoIndex } from "./doc/IEdoIndex";
import { EdoDiffApi } from "./EdoDiffApi";
import { ISettings } from "./doc/ISettings";
import { CsvUtils } from "./utils/CsvUtils";
import { EndevorRestApi } from "./utils/EndevorRestApi";
import { IRestResponse } from "./doc/IRestResponse";
import { AsyncUtils } from "./utils/AsyncUtils";

/**
 * Edo commit api
 */
export class EdoPushApi {

	/**
	 * Push changes in cache (committed changes) to remote repo (Endevor).
	 *
	 * Push can be limited to specific files from the array passed to it.
	 * Local stage is used to perform push. It is compared with remote stage
	 * and all files which are different will be pushed.
	 *
	 * @param config ISettings with repo URL and credentials
	 * @param stage name or sha1 of index to be pushed
	 * @param files list of files to limit the push to
	 */
	public static async push(config: ISettings, stage: string, ccid: string, comment: string, files: string[] = []) {
		let index: IEdoIndex;
		let remoteIndex: IEdoIndex;

		// get local index
		if (HashUtils.isSha1(stage)) {
			index = await EdoCache.readIndex(stage);
			stage = index.stgn;
		} else {
			const sha1 = await FileUtils.readRefs(stage);
			if (isNullOrUndefined(sha1)) {
				throw new Error(`Stage ${stage} doesn't exist!`);
			}
			if (!HashUtils.isSha1(sha1)) {
				throw new Error(`Local stage ${stage} doesn't have index! Run 'edo pull'...`);
			}
			index = await EdoCache.readIndex(sha1);
		}
		// get remote index
		const rIdxSha1 = await FileUtils.readRefs(stage, true);
		if (isNullOrUndefined(rIdxSha1) || !HashUtils.isSha1(rIdxSha1)) {
			throw new Error(`Remote stage doesn't exist! Run 'edo fetch'...`);
		}
		remoteIndex = await EdoCache.readIndex(rIdxSha1);

		const fingers: string[] = EdoDiffApi.diffIndexFinger(index, remoteIndex);
		if (fingers.length > 0) {
			throw new Error(`Local stage not in sync with remote stage! Run 'edo merge' and 'edo commit' to merge changes from remote...`);
		}

		// grab differences
		const diffs = EdoDiffApi.getIndexDiff(index, remoteIndex);
		let diffFiles = Object.keys(diffs);
		let pushFiles: string[][] = [];

		// iterate over changes and put them in index
		for (const file of diffFiles) {
			if (files.length > 0 && files.indexOf(file) < 0) continue; // skip files not selected

			// delete
			if (diffs[file][0] == 'null') {
				// if (!all) continue; // skip if option 'all' not set
				// delete index.elem[file];
				continue;
			}

			// add
			if (diffs[file][1] == 'null') {
				// if (!all) continue; // skip if option 'all' not set
				// isAdd = true;
				continue;
			}

			// lsha1,rsha1,fingerprint,hsha1,type/element
			pushFiles.push(index.elem[file]);
		}

		// run push
		if (pushFiles.length > 0) {
			// ----------------------------------------------------[===
			process.stdout.write(`pushing elements for <${stage}>  `);
			let pushedKeys = await AsyncUtils.promiseAll(
				pushFiles.map(item => EdoPushApi.pushElement(config, stage, item[4], item[0], ccid, comment, item[2])),
				AsyncUtils.progressBar);

			let updateIndex: boolean = false;
			for (const key of pushedKeys) {
				if (isNullOrUndefined(key)) continue;
				if (isNullOrUndefined(remoteIndex.elem[key.file])) continue; // TODO: remove when add new file implemented
				remoteIndex.elem[key.file][0] = index.elem[key.file][0]; // update lsha1 in remote
				remoteIndex.elem[key.file][2] = key.fingerprint; // update fingerprint in remote
				index.elem[key.file][2] = key.fingerprint;       // and local index
				updateIndex = true;
			}

			if (updateIndex) {
				let indexSha1 = await EdoCache.writeIndex(index);
				if (indexSha1 != null) {
					FileUtils.writeRefs(stage, indexSha1); // update local refs
					indexSha1 = await EdoCache.writeIndex(remoteIndex);
					if (indexSha1 != null) {
						FileUtils.writeRefs(stage, indexSha1, true); // update remote refs
						console.log(`push ${stage} done!`);
						return;
					}
				}
			}
		}
		console.log(`nothing to push...`);
	}

	/**
	 * Push file to Endevor (do add element action) and get back new fingerprint.
	 *
	 * @param config ISettings from config file
	 * @param stage string in format `env-stgnum-system-subsystem`
	 * @param file name in format `typeName/eleName` (last item in index list)
	 * @param fileSha1 sha1 of file object which should be pushed
	 * @param ccid endevor ccid (used during add element action)
	 * @param comment endevor comment (used during add element action)
	 * @param finger fingerprint (3rd item in index list)
	 * @returns object with file name and fingerprint e.g.: `{ file: 'type/element', fingerprint: 'xxxx' }`
	 */
	public static async pushElement(config: ISettings, stage: string, file: string, fileSha1: string, ccid: string, comment: string, finger: string) {
		try {
			let stageParts = stage.split('-');
			let elemParts = CsvUtils.splitX(file, FileUtils.separator, 1);
			let fileBuf = await EdoCache.getSha1Object(fileSha1, EdoCache.OBJ_BLOB);
			let pushHead = EndevorRestApi.getJsonHeader(config);
			let eleURL = `env/${stageParts[0]}/stgnum/${stageParts[1]}/sys/${stageParts[2]}/subsys/${stageParts[3]}/type/${elemParts[0]}/ele/` + encodeURIComponent(elemParts[1]);

			const response: IRestResponse = await EndevorRestApi.addElementHttp(config.repoURL + eleURL, fileBuf, ccid, comment, finger, pushHead);

			let jsonBody;
			// check if error, or not found
			if (!isNullOrUndefined(response.status) && response.status != 200 ) {
				try {
					// parse body, there will be messages
					jsonBody = JSON.parse(response.body);
				} catch (err) {
					console.error("json parsing error: " + err);
					return null;
				}
				if (response.status != 206) {
					console.error(`Error pushing file ${file}:\n${jsonBody.messages}`);
				} else {
					console.warn(`No changes detected in Endevor for file ${file}:\n${jsonBody.messages}`);
				}
				return null;
			}
			// element pushed, save new fingerprint
			const fingerprint: any = response.headers["fingerprint"];

			return { fingerprint: fingerprint, file: file };
		} catch (err) {
			console.error(`Exception when pushing file '${file}' from stage '${stage}':\n${err.message}`);
			return null;
		}
	}

}
