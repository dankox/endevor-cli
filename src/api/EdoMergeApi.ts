import { FileUtils } from "./utils/FileUtils";
import { HashUtils } from "./utils/HashUtils";
import { isNullOrUndefined } from 'util';
import { MergeUtils, IMergedResult } from './utils/MergeUtils';
import { EdoCache } from "./EdoCache";
import { IEdoIndex, EdoIndex } from "./doc/IEdoIndex";

/**
 * Endevor pull sources from remote location
 */
export class EdoMergeApi {

	/**
	 * Merge files in local repo with remote repo.
	 *
	 * @param stage name or index sha1 for merge to perform on
	 * @param remoteStage name of remote stage (using local name). If you want merge with local stage, specify sha1
	 * @param files list of files which you can limit merge on (if empty, merge the whole local index), default `empty`
	 */
	public static async merge(stage: string, remoteStage?: string, files: string[] = []) {
		let localIndexExists: boolean = false;
		let indexLocal: IEdoIndex | null = null;
		let indexRemote: IEdoIndex | null = null;
		let indexSha1Local: string | null = null;
		let indexSha1Remote: string | null = null;

		// if sha1, grab stage name from index file (for both remote and local)
		if (!isNullOrUndefined(remoteStage)) {
			if (HashUtils.isSha1(remoteStage)) {
				indexRemote = await EdoCache.readIndex(remoteStage);
				remoteStage = indexRemote.stgn;
			}
		}
		if (HashUtils.isSha1(stage)) {
			indexLocal = await EdoCache.readIndex(stage);
			stage = indexLocal.stgn;
		}
		// use local name if remote not specified
		if (isNullOrUndefined(remoteStage)) {
			remoteStage = stage;
		}

		// read index, or create new empty one
		indexSha1Local = await FileUtils.readRefs(stage); // get local index sha1
		indexSha1Remote = await FileUtils.readRefs(remoteStage, true); // get remote index sha1
		if (indexSha1Local != null) {
			indexLocal = await EdoCache.readIndex(indexSha1Local); // load remote index
			localIndexExists = true;
			if (indexSha1Remote == null) {
				throw new Error("no remote to merge!");
			}
			indexRemote = await EdoCache.readIndex(indexSha1Remote);
		} else {
			if (indexSha1Remote == null) {
				throw new Error("no local and remote index! nothing to merge...");
			}
			// copy the remote to local, merge will just populate directory with remote changes...
			console.error("no local index!");
			indexRemote = await EdoCache.readIndex(indexSha1Remote); // load the remote index
			indexLocal = EdoIndex.clone(indexRemote); // clone local index from remote
		}

		// TODO: maybe just choose base from remote and put it into already loaded local index???
		// if remote stage is different than local, use remote (it has base from Endevor)
		if (stage != remoteStage) {
			const rStage = await FileUtils.readRefs(stage, true);
			if (rStage != null) {
				indexLocal = await EdoCache.readIndex(rStage);
			}
		}

		// TODO: use files when merging (currently not used at all)
		// Check correct file format
		for (const file of files) {
			if (!file.match(/^[0-9A-Za-z]+\/.+$/)) {
				throw new Error(`File ${file} doesn't match typeName/elementName format!`);
			}
		}

		// Merging... (go thru local index files)
		if (!localIndexExists) console.log("populating working directory...");
		else console.log("merging working directory...");

		let mergedFiles = await EdoMergeApi.mergeStages(indexLocal, indexRemote);
		let mergedKeys = Object.keys(mergedFiles);
		let allMerged: boolean = true;
		let noUpdates: boolean = false;
		for (const file of mergedKeys) {
			if (mergedFiles[file] == MergeUtils.STATUS_CONFLICT) {
				allMerged = false;
				console.log(`conflict detected in file ${file}...`);
			} else if (mergedFiles[file] == MergeUtils.STATUS_DELETED) {
				console.log(`file ${file} deleted in remote...`);
			} else if (mergedFiles[file] == MergeUtils.STATUS_UP2DATE) {
				noUpdates = true;
			}
		}

		// write remote sha1 to MERGE file for further processing in commit (when changes will be confirmed)
		await FileUtils.writeFile(`${FileUtils.getEdoDir()}/${FileUtils.mergeFile}`, Buffer.from(indexSha1Remote));

		// write local index if it didn't exist before
		if (!localIndexExists) {
			indexSha1Local = await EdoCache.writeIndex(indexLocal);
			if (indexSha1Local == null) {
				throw new Error("Error... index is null!");
			}
			await FileUtils.writeRefs(stage, indexSha1Local);
		}

		if (allMerged) {
			if (localIndexExists) {
				if (noUpdates) {
					console.log(`nothing to merge, stage is up to date...`);
				} else {
					console.log(`stage merged in working directory... run 'edo commit' or review changes`);
				}
			} else {
				console.log(`local index created...`);
			}
		} else {
			console.log(`stage merged in working directory, review conflicts before commiting!`);
		}
	}

	/**
	 * Merge remote stage into local stage. Merge is done in working directory,
	 * none of the indexes are updated (this should be handled by caller).
	 *
	 * Remote stage can be anything (even local stage), but is considered
	 * as a remote so only lsha1 is used.
	 *
	 * Local stage is checked out stage (or any other) and lsha1 is taken
	 * as local change and rsha1 is taken as base (for 3way merge).
	 *
	 * @param local stage index
	 * @param remote stage index
	 * @param files list of files in format `typeName/eleName` which you want to merge. Default `[]` -> everything in local index
	 * @param includeWd include working directory files in merge (to use as local if presented), default `true`
	 * @param outDirectory output directory where to create merged files (needs to end with `/`). If not
	 * specified, default Edo working directory is used (`FileUtils.edoCwd`)
	 */
	public static async mergeStages(local: IEdoIndex, remote: IEdoIndex, files: string[] = [],
		includeWd: boolean = true, outDirectory?: string): Promise<{[key: string]: string}> {

		// verify local and remote to be specified
		if (isNullOrUndefined(local) && isNullOrUndefined(remote)) {
			throw new Error("no index specified!");
		}

		let mergedFiles: {[key: string]: string} = {};
		let localList: string[][] = Object.values(local.elem);
		// if no local list, grab remote instead
		if (localList.length == 0) {
			localList = Object.values(remote.elem);
		}

		// loop thru index files for merge
		for (let localItem of localList) {
			// lsha1,rsha1,fingerprint,hsha1,typeName/fullElmName
			const element = localItem[4]; // type/element

			// if files provided check if we want to merge it
			if (files.length > 0) {
				if (files.indexOf(element) == -1) continue; // skip for not included
			}

			// If deleted
			if (isNullOrUndefined(remote.elem[element])) {
				mergedFiles[element] = MergeUtils.STATUS_DELETED;
				continue; // skip if remote doesn't have
			}

			let wdFile = (isNullOrUndefined(outDirectory) ? FileUtils.cwdEdo : outDirectory) + element;
			const workExist: boolean = await FileUtils.exists(wdFile);
			// [ lsha1, rsha1, fingerprint, hsha1, typeName/fullElmName ]
			let localSha1  = localItem[0];
			let baseSha1  = localItem[1];
			let remoteSha1  = remote.elem[element][0];

			// if workfile doesn't exist, or if we don't care about it
			if (!workExist || !includeWd) {
				// if same sha1, just update working directory with local sha1
				if (localSha1 == remoteSha1) {
					try {
						await FileUtils.writeFile(wdFile, await EdoCache.getSha1Object(localSha1, EdoCache.OBJ_BLOB));
						mergedFiles[element] = MergeUtils.STATUS_MERGED;
					} catch (err) {
						console.error(`Error while updating working directory file '${element}': ${err}`);
					}
					continue; // merge done! go next
				} else {
					// TODO: this is like fast-forward, need to be updated when list of fingerprints will be implemented
					// if base and local is the same (no changes), use remote (dont' do merge)
					if (baseSha1 == localSha1) {
						try {
							await FileUtils.writeFile(wdFile, await EdoCache.getSha1Object(remoteSha1, EdoCache.OBJ_BLOB));
							mergedFiles[element] = MergeUtils.STATUS_MERGED;
						} catch (err) {
							console.error(`Error while updating working directory file '${element}': ${err}`);
						}
						continue; // merge done! go next
					} else {
						// if all sha1 different, do 3-way merge
						const baseBuf: Buffer = await EdoCache.getSha1Object(baseSha1, EdoCache.OBJ_BLOB);
						const localBuf: Buffer = await EdoCache.getSha1Object(localSha1, EdoCache.OBJ_BLOB);
						const remoteBuf: Buffer = await EdoCache.getSha1Object(remoteSha1, EdoCache.OBJ_BLOB);
						const tmpMerged: IMergedResult = MergeUtils.merge3bufs(baseBuf, localBuf, remoteBuf);
						try {
							await FileUtils.writeFile(wdFile, tmpMerged.buffer);
							mergedFiles[element] = tmpMerged.status;
						} catch (err) {
							console.error(`Error while updating working directory file '${element}': ${err}`);
						}
						continue; // merge done! go next
					}
				}
			}

			// handle when workfile exists and we want to include working files
			let wsha1;
			try {
				wsha1 = await HashUtils.getEdoFileHash(wdFile);
			} catch (err) {
				console.error(`Error occurs during read of file '${element}': ${err}`);
				continue;
			}

			// same as remote, nothing to merge... (but mark as merged)
			if (wsha1 == remoteSha1) {
				mergedFiles[element] = MergeUtils.STATUS_UP2DATE;
				continue; // merge done! go next
			}

			// base and wdfile are the same (no changes detected), just update to remote
			if (baseSha1 == wsha1) {
				try {
					await FileUtils.writeFile(wdFile, await EdoCache.getSha1Object(remoteSha1, EdoCache.OBJ_BLOB));
					mergedFiles[element] = MergeUtils.STATUS_MERGED;
				} catch (err) {
					console.error(`Error while updating working directory file '${element}': ${err}`);
				}
			} else if (baseSha1 == remoteSha1) {
				// if wsha1 != base and base = remotesha1, then we are up to date (no changes required)
				mergedFiles[element] = MergeUtils.STATUS_UP2DATE;
				continue; // merge done! go next
			} else {
				// if all sha1 different, do 3-way merge
				const baseBuf: Buffer = await EdoCache.getSha1Object(baseSha1, EdoCache.OBJ_BLOB);
				const localBuf: Buffer = await FileUtils.readFile(wdFile);
				const remoteBuf: Buffer = await EdoCache.getSha1Object(remoteSha1, EdoCache.OBJ_BLOB);
				const tmpMerged: IMergedResult = MergeUtils.merge3bufs(baseBuf, localBuf, remoteBuf);
				try {
					await FileUtils.writeFile(wdFile, tmpMerged.buffer);
					mergedFiles[element] = tmpMerged.status;
				} catch (err) {
					console.error(`Error while updating working directory file '${element}': ${err}`);
				}
			}
		}

		return mergedFiles;
	}

}
