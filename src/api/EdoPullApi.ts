import { FileUtils } from "./utils/FileUtils";
import { HashUtils } from "./utils/HashUtils";
import { isNullOrUndefined } from 'util';
import { ISettings } from './doc/ISettings';
import { IRestResponse } from './doc/IRestResponse';
import { EndevorRestApi } from './utils/EndevorRestApi';
import { EdoMerge } from './EdoMerge';
import { IMerge3way } from './doc/IMerge3way';
import { EdoCache } from "./EdoCache";
import { IEdoIndex, EdoIndex } from "./doc/IEdoIndex";
import { CsvUtils } from "./utils/CsvUtils";

/**
 * Endevor pull sources from remote location
 */
export class EdoPullApi {

	/**
	 * Pull elements from remote repo to local repo.
	 *
	 * @param config ISettings with repo URL and credentials
	 * @param stage name or index sha1 for pull. If sha1, stage name will be used from
	 * already existed index (referenced by sha1 id).
	 * @param files list of files which you can force pull (if empty, pull only updated files on remote - which you get by running fetch)
	 * @param type of the files to pull (`EdoCache.OBJ_BLOB` - elements, `EdoCache.OBJ_LOG` - print history?) default `EdoCache.OBJ_BLOB`
	 * @param search in map if not in remote stage (use when trying to grab elements from higher location in the map, default `false`)
	 */
	public static async pull(config: ISettings, stage: string, files: string[], type: string = EdoCache.OBJ_BLOB, search: boolean = false) {
		let index: IEdoIndex | null = null;
		let indexSha1: string | null = null;
		let file_list: {[key: string]: string } = {}; // list for download
		let index_list: {[key: string]: string } = {}; // list from index file
		let orig_base_list: {[key: string]: string } = {}; // list created when pulled to store original rsha1 (for base)

		// if sha1, grab stage name from index file, or load index
		if (HashUtils.isSha1(stage)) {
			indexSha1 = stage;
			index = await EdoCache.readIndex(indexSha1);
			stage = index.stgn;
			index_list = index.elem;
		} else {
			indexSha1 = await FileUtils.readRefs(stage);
			if (indexSha1 != null) {
				index = await EdoCache.readIndex(indexSha1);
				index_list = index.elem;
			} else {
				console.error("no index!"); // don't stop
				index = EdoIndex.init(stage);
			}
		}

		// Check correct file format
		for (const file of files) {
			if (file.match(/^[0-9A-Za-z]+\/.+$/)) {
				file_list[file] = `lsha1,rsha1,null,null,${file}`; // lsha1,rsha1,fingerprint,fileExt,typeName/fullElmName
			} else {
				throw new Error(`File ${file} doesn't match typeName/elementName format!`);
			}
		}

		process.stdout.write("pulling elements...");
		let pulledKeys: (string | null)[] = await Promise.all(files.map(item => EdoPullApi.getElement(config, stage, item, search)));
		console.log(" "); // new line to console log

		// update index
		pulledKeys.forEach(pullKey => {
			if (isNullOrUndefined(pullKey)) return; // skip nulls

			const keyParts = CsvUtils.splitX(pullKey, ',', 2); // sha1,fingerprint,type/element
			const listLine = isNullOrUndefined(index_list[keyParts[2]]) ? file_list[keyParts[2]] : index_list[keyParts[2]];
			let tmp = CsvUtils.splitX(listLine, ',', 4); // lsha1,rsha1,fingerprint,hsha1,typeName/fullElmName (new version)
			if (tmp[1] != 'rsha1')
				orig_base_list[keyParts[2]] = tmp[1]; // save original rsha1 for later merge (as base)
			tmp[1] = keyParts[0]; // remote-sha1
			tmp[2] = keyParts[1]; // fingerprint
			index_list[keyParts[2]] = tmp.join(','); // update index with new rsha1 and fingerprint
		});

		// update index list
		index.elem = index_list;
		indexSha1 = await EdoCache.writeIndex(index);
		if (indexSha1 == null) {
			throw new Error("Error... index is null!");
		}
		await FileUtils.writeRefs(stage, indexSha1);
		console.log("pull done!");

		// Merging... (go thru pulled files only)
		console.log("updating working directory...");
		let updateIndex: boolean = false;
		for (let pullKey of pulledKeys) {
			if (isNullOrUndefined(pullKey)) return; // skip nulls

			const element = CsvUtils.splitX(pullKey, ',', 2)[2]; // sha1,fingerprint,type/element
			// let elemParts = CsvUtils.splitX(element, FileUtils.separator, 1);
			let wdFile = FileUtils.cwdEdo + element;
			let tmpItem = CsvUtils.splitX(index_list[element], ',', 4); // lsha1,rsha1,fingerprint,hsha1,typeName/fullElmName
			// TODO: deleted?? should be merged somehow with local? conflict??
			if (tmpItem[1] == 'rsha1')
				continue; // for not pulled element, skip merge

			const workExist: boolean = await FileUtils.exists(wdFile);
			if (tmpItem[0] == 'lsha1' && !workExist) { // if no local and doesn't exist in working directory copy it there
				try {
					await FileUtils.writeFile(wdFile, await EdoCache.getSha1Object(tmpItem[1], EdoCache.OBJ_BLOB));
					// save sha1 from remote to local
					tmpItem[0] = tmpItem[1];
					index_list[element] = tmpItem.join(','); // update index list
					updateIndex = true;
				} catch (err) {
					console.error(`Error while updating working directory element '${element}': ${err}`);
				}
			} else { // merge (if it has lsha1 or it already exists in workdir, create merge content)
				try {
					if (tmpItem[0] == 'lsha1' && workExist) {
						const lsha1 = await HashUtils.getFileHash(wdFile);
						if (lsha1 == tmpItem[1]) continue; // for the same as remote, skip
					}
					if (isNullOrUndefined(orig_base_list[element])) {
						// TODO: do 2 way diff when don't have base (remote from before)
						// for no base, I should just show conflict, incomming and mine... <<< local === >>> remote
						// Currently no base, no merge, just overwrite local changes = =
						await FileUtils.writeFile(wdFile, await EdoCache.getSha1Object(tmpItem[1], EdoCache.OBJ_BLOB));
						if (workExist) {
							console.log(`'${wdFile}' in working directory overwritten, do 'edo diff' to see differences... (NOT TRACKED!!! MERGE DOESN'T WORK!!! probably ADD??)`);
						}
						continue;
					}
					let trimTrailingSpace = true;
					let baseStr = (await EdoCache.getSha1Object(orig_base_list[element])).toString();
					const mineStr = (await FileUtils.readFile(wdFile)).toString();
					const theirsStr = (await EdoCache.getSha1Object(tmpItem[1])).toString();
					if (mineStr == baseStr) {
						// wdfile same as base, no local change => write remote to working directory
						await FileUtils.writeFile(wdFile, await EdoCache.getSha1Object(tmpItem[1], EdoCache.OBJ_BLOB));
						continue;
					}
					const mergearg: IMerge3way = {
						base: baseStr,
						mine: mineStr,
						theirs: theirsStr
					};
					let merged: string[] = EdoMerge.merge3way(mergearg, trimTrailingSpace);
					const isOk = merged.shift();
					// TODO: check the line endings, last line is not merged properly (last empty line)
					let tmpBuf: Buffer = Buffer.from(merged.join('\n'));
					// let lsha1 = hash.getHash(tmpBuf);
					await FileUtils.writeFile(wdFile, tmpBuf);
					if (isOk == 'conflict') {
						// lsha1 = 'x-' + lsha1; // TODO: ??? what to do how to mark it (maybe x- and use it also in status)
						console.error(`There is conflict in file ${wdFile} !`);
					}
					// don't do this, we don't want to overwrite commited local changes
					// tmpItem[0] = lsha1;
					// file_list[element] = tmpItem.join(',');
				} catch (err) {
					console.error(`Error occurs during merge of '${element}': ${err}`);
				}
			}
		}

		// update index list
		if (updateIndex) {
			index.elem = index_list;
			indexSha1 = await EdoCache.writeIndex(index);
			if (indexSha1 == null) {
				throw new Error("Error... index is null!");
			}
			await FileUtils.writeRefs(stage, indexSha1);
		}
		console.log("update done!");
	}

	public static async getElement(config: ISettings, stage: string, element: string, search: boolean = false): Promise<string | null> {
		let stageParts = stage.split('-');
		let elemParts = CsvUtils.splitX(element, FileUtils.separator, 1);
		let pullHead = EndevorRestApi.getBinaryHeader(config);
		let eleURL = `env/${stageParts[0]}/stgnum/${stageParts[1]}/sys/${stageParts[2]}/subsys/${stageParts[3]}/type/${elemParts[0]}/ele/` + encodeURIComponent(elemParts[1]);
		eleURL += "?noSignout=yes";
		if (search)	eleURL += "&search=yes";

		try {
			const response: IRestResponse = await EndevorRestApi.getHttp(config.repoURL + eleURL, pullHead);
			process.stdout.write('.'); // TODO: what to do with this output :) it's in api...

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
					console.error(`Error obtaining element from url '${eleURL}':\n${jsonBody.messages}`);
				} else {
					console.warn(`Element '${element}' not found in stage '${stage}', re-run 'edo fetch' or 'edo pull ${element}'`);
				}
				return null;
			}
			// element obtained, write it into file
			const body: Buffer = response.body;
			const fingerprint: any = response.headers["fingerprint"];
			const sha1 = await EdoCache.addSha1Object(body, EdoCache.OBJ_BLOB);

			return `${sha1},${fingerprint},${element}`;
		} catch (err) {
			console.error(`Exception when obtaining element '${element}' from stage '${stage}':\n${err}`);
			return null;
		}
	}
}



// Test
(async () => {
	let config = await FileUtils.readSettings();
	let stage = await FileUtils.readStage();
	// let files = EdoCache.getFiles(await EdoCache.readIndex(stage), 'fingerprint=null');
	let files = [ 'ASMPGM/BC1PENCR' ];
	await EdoPullApi.pull(config, stage, files);
})();