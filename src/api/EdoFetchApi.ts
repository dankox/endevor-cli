import { FileUtils } from "./utils/FileUtils";
import { ISettings } from "./doc/ISettings";
import { EndevorRestApi } from "./utils/EndevorRestApi";
import { isNullOrUndefined } from "util";
import { IRestResponse } from "./doc/IRestResponse";
import { IEleList } from "./doc/IEleList";
import { CsvUtils } from "./utils/CsvUtils";
import { EdoCache } from "./EdoCache";
import { IEdoIndex, EdoIndex } from "./doc/IEdoIndex";
import { HashUtils } from "./utils/HashUtils";
import { AsyncUtils } from "./utils/AsyncUtils";

/**
 * Endevor fetch remote stage to local
 */
export class EdoFetchApi {
	static readonly listele: string = "env/*/stgnum/*/sys/*/subsys/*/type/*/ele";

	/**
	 * Fetch remote repo for stage and config specified in parameters.
	 * Populates index file and store it in edo database.
	 * Updates remote refs file with up-to-date index sha1.
	 *
	 * @param config ISettings with repo URL and credentials
	 * @param stage name or sha1 to fetch. If sha1, stage name will be used from
	 * already existed index (referenced by sha1 id).
	 * @param files list of files which you can force fetch (if empty, fetch only updated files from index)
	 * @param type of the files to fetch (`EdoCache.OBJ_BLOB` - elements, `EdoCache.OBJ_LOGS` - print history?) default `EdoCache.OBJ_BLOB`
	 * @param search in map if not in remote stage (use when trying to grab elements from higher location in the map, default `false`)
	 */
	public static async fetchRemote(config: ISettings, stage: string, files: string[] = [], type: string = EdoCache.OBJ_BLOB,
		search: boolean = false, hints: boolean = true): Promise<IEdoIndex> {

		let index: IEdoIndex;
		let indexSha1: string | null = null;
		let updateIdx: boolean = false;

		// if sha1, grab stage name from index file, or load index
		if (HashUtils.isSha1(stage)) {
			index = await EdoCache.readIndex(stage);
			stage = index.stgn;
		}

		// read index, or create new empty one
		indexSha1 = await FileUtils.readRefs(stage, true); // get remote index sha1
		if (indexSha1 != null) {
			index = await EdoCache.readIndex(indexSha1); // load remote index
		} else {
			console.log("no remote index!"); // don't stop
			index = EdoIndex.init(stage); // init empty index with stage name
		}

		// ----------------------------------------------------[===
		process.stdout.write(`fetching index for <${stage}>    `);
		if (files.length == 0) {
			// for no files passed, fetch index from Endevor and pick files from it
			updateIdx = await EdoFetchApi.fetchIndex(config, index);
			files = EdoCache.getFiles(index, "fingerprint=null"); // get files with no fingerprint
			// for logs add files which doesn't have them
			if (type == EdoCache.OBJ_LOGS) {
				const logs = EdoCache.getFiles(index, "logs=null"); // get files with no log file
				files = [...new Set([...files, ...logs])];
			}
		} else {
			// files passed, fetch index and filter it to contain files specified
			updateIdx = await EdoFetchApi.fetchIndex(config, index, files);

			if (!search) {
				files = EdoCache.getFiles(index, "fingerprint=null");
				// for logs, use the array as is... logs needs to be updated too
			} else {
				// Check correct file format
				for (const file of files) {
					if (!file.match(/^[0-9A-Za-z]+\/.+$/)) {
						throw new Error(`File ${file} doesn't match typeName/elementName format!`);
					}
				}
			}
		}

		// fetch elements either from index or specified as argument
		if (files.length > 0) {
			// fetch element files
			if (type == EdoCache.OBJ_BLOB) {
				// ----------------------------------------------------[===
				process.stdout.write(`fetching elements for <${stage}> `);
				let fetchedKeys: string[][] = await AsyncUtils.promiseAll(files.map(item => EdoFetchApi.fetchElement(config, stage, item, search)), AsyncUtils.progressBar);

				// filter nulls from fetchedKeys for fetching bases
				let baseFiles: string[] = [];
				const types = await EdoCache.readTypes(index.type);
				for (const fetched of Object.values(fetchedKeys)) {
					if (fetched[0] != 'null' && fetched[0] != 'del') {
						const type = fetched[4].split(FileUtils.separator);
						if (types[type[0]][0] == 'T') {
							baseFiles.push(fetched[4]);
						}
					}
				}
				// ----------------------------------------------------[===
				process.stdout.write(`fetching bases for <${stage}>    `);
				let baseKeys: string[][] = [];
				// do not call it when there is no base file, it might get stuck...
				if (baseFiles.length > 0) {
					baseKeys = await AsyncUtils.promiseAll(baseFiles.map(item => EdoFetchApi.fetchElement(config, stage, item, search, (index.elem[item] && index.elem[item][5]))), AsyncUtils.progressBar);
				}

				let bases: { [key: string]: string } = {};
				for (const baseKey of baseKeys) {
					if (baseKey[0] == 'null' || baseKey[0] == 'del') continue;
					bases[baseKey[4]] = baseKey[0];
				}

				// update index with new sha1 and fingerprint
				for (const fetchKey of fetchedKeys) {
					if (fetchKey[0] == 'null') continue; // skip for errors

					if (fetchKey[0] == 'del') {
						delete index.elem[fetchKey[4]]; // remove from index (deleted in remote)
						continue;
					}
					if (!isNullOrUndefined(index.elem[fetchKey[4]])) {
						// for existing index key, save 3rd field (hsha1)
						fetchKey[3] = index.elem[fetchKey[4]][3];
					}
					// for fetched base, use it as remote/base sha1 in index
					if (!isNullOrUndefined(bases[fetchKey[4]])) {
						fetchKey[1] = bases[fetchKey[4]];
					}
					index.elem[fetchKey[4]] = fetchKey;
					updateIdx = true;
				}
			}

			// filter text files only for logs
			let logFiles: string[] = [];
			const types = await EdoCache.readTypes(index.type);
			for (const file of files) {
				const type = file.split(FileUtils.separator);
				if (types[type[0]][0] == 'T') {
					logFiles.push(file);
				}
			}
			// fetch element logs (history)
			if (logFiles.length > 0 && type == EdoCache.OBJ_LOGS) {
				// ----------------------------------------------------[===
				process.stdout.write(`fetching history for <${stage}>  `);

				let fetchedKeys: string[][] = await AsyncUtils.promiseAll(logFiles.map(item => EdoFetchApi.fetchHistory(config, stage, item)), AsyncUtils.progressBar);

				// update index with new sha1 and fingerprint
				for (const fetchKey of fetchedKeys) {
					if (fetchKey[3] == 'null') continue; // skip for errors

					if (fetchKey[3] == 'del') {
						fetchKey[3] = 'null'; // set to null for update
					}
					if (!isNullOrUndefined(index.elem[fetchKey[4]])) {
						// for existing index key, save 3rd field (hsha1)
						index.elem[fetchKey[4]][3] = fetchKey[3];
					} else {
						index.elem[fetchKey[4]] = fetchKey;
					}
					updateIdx = true;
				}
			}
		}
		index.stat = 'remote'; // TODO: ??? to mark as remote ???

		if (updateIdx) {
			// write index for remote stage (fetch doesn't work on local stage)
			console.log(`writing index for remote/${stage}...`);
			indexSha1 = await EdoCache.writeIndex(index);
			if (indexSha1 != null) await FileUtils.writeRefs(stage, indexSha1, true); // update refs
			console.log(`fetch of remote/${stage} done!`);
			if (hints && type == EdoCache.OBJ_BLOB) {
				console.log(`run 'edo merge' to merge it into local...`);
				if (files.length == 0) {
					console.log("no files in remote stage!");
				}
			}
		} else {
			if (hints) {
				console.log(`nothing to update...`);
			}
		}

		// return index if this function should be used more complex scenario
		return index;
	}

	/**
	 * Fetch index from remote repo. What this means, is get element/type list from
	 * Endevor and update index passed as argument to reflect changes obtained from
	 * remote. Any new/updated element in Endevor will be included and fingerprint
	 * will be set to `null`.
	 *
	 * `IEdoIndex.stat` will be set to `EdoIndex.STAT_UPDATED` when any change occurs
	 * on the passed index.
	 *
	 * @param config ISettings with repo URL and credentials
	 * @param index passed to update with lists from remote repo (Endevor)
	 * @param filterFiles list of files which should be included in index (to not include all from the element list).
	 * By default it's empty `[]`, which means no filter.
	 */
	public static async fetchIndex(config: ISettings, index: IEdoIndex, filterFiles: string[] = []) {
		let updated: boolean = false;
		// TODO: getElementList could do list ele data=ele, to grab change levels instead of list to create fingerprint list
		// get element list and fetch types to database
		let [ eleList, typeSha1 ] = await AsyncUtils.promiseAll([
			EdoFetchApi.getElementList(config, index.stgn),
			EdoFetchApi.fetchTypes(config, index.stgn)
		], AsyncUtils.progressBar);

		if (index.type != typeSha1) {
			index.type = typeSha1;
			updated = true;
		}

		if (!isNullOrUndefined(eleList)) {
			eleList.forEach((ele: IEleList) => {
				const key = `${ele.typeName}${FileUtils.separator}${ele.fullElmName}`;
				if (filterFiles.length > 0 && filterFiles.indexOf(key) == -1) return; // skip if not in filter (when it is passed)

				// get base vvll
				let baseVVLL = ele.baseVVLL;
				if (baseVVLL.length == 3) {
					baseVVLL = baseVVLL.substr(0, 2) + "0" + baseVVLL.substr(2);
				}
				// for the same base as last, set null to not retrieve
				if (baseVVLL == ele.elmVVLL) {
					baseVVLL = 'null';
				}

				if (!isNullOrUndefined(index.elem[key])) {
					// TODO: if we have fingerprint list, the fingerprint field should contain sha1 for fingerprint list
					let tmpItem = index.elem[key]; // lsha1,rsha1,fingerprint,hsha1,typeName/fullElmName (new version)
					if (tmpItem[2] != ele.fingerprint) {
						tmpItem[2] = "null"; // nullify fingerprint for pull (it pulls only null fingerprint)
						updated = true;
					}
				} else {
					// for non-existent index key, create new one
					index.elem[key] = [`null`, `null`, `null`, `null`, key];
					updated = true;
				}
				index.elem[key][5] = baseVVLL;
			});
		} else {
			// TODO: do I care? should I update index??? all elements deleted??
			// console.error("list of elements is empty!!! (DELETED???)");
			index.elem = {};
		}

		// set status on index to updated
		if (updated) index.stat = EdoIndex.STAT_UPDATED;

		return updated;
	}

	/**
	 * Get element list for stage(subsystem) from Endevor repo specified in config file.
	 *
	 * @param config ISettings from config file
	 * @param stage string in format 'env-stgnum-system-subsystem'
	 * @returns list of object containing element information from /ele endpoint
	 */
	public static async getElementList(config: ISettings, stage: string): Promise<any[]> {
		let stageParts = stage.split('-');
		let listHead = EndevorRestApi.getJsonHeader(config);
		const listEle = `env/${stageParts[0]}/stgnum/${stageParts[1]}/sys/${stageParts[2]}/subsys/${stageParts[3]}/type/*/ele`; // not enough need baseVVLL ?data=BAS`; // basic is enough

		try {
			const response: IRestResponse = await EndevorRestApi.getHttp(config.repoURL + listEle, listHead);
			let resBody;
			try {
				resBody = JSON.parse(response.body);
			} catch (err) {
				throw new Error("element json parsing error: " + err);
			}
			if (!isNullOrUndefined(response.status) && response.status > 300 ) {
				throw new Error(`Error obtaining element list for stage '${stage}':\n${resBody.messages}`);
			}
			let result = resBody.data;
			if (!isNullOrUndefined(result)) {
				if (isNullOrUndefined(result[0])) {
					result = [];
					result[0] = resBody.data;
				}
			}
			return result;
		} catch (err) {
			throw new Error(`Exception when obtaining element list for stage '${stage}':\n${err}`);
		}
	}

	/**
	 * Fetch element from Endevor (do retrieve action) and save it as sha1 in Edo database.
	 *
	 * @param config ISettings from config file
	 * @param stage string in format `env-stgnum-system-subsystem`
	 * @param element name in format `typeName/eleName` (last item in index list)
	 * @param search in map if not in remote stage (use when trying to grab elements from higher location in the map, default `false`)
	 * @param vvll version and level of element to fetch (retrieve)
	 * @returns array `[ sha1, sha1, fingerprint, null, element ]`, if not found or error `[ null, null, null, null, element ]`
	 */
	public static async fetchElement(config: ISettings, stage: string, element: string, search: boolean = false, vvll?: string): Promise<string[]> {
		if (!isNullOrUndefined(vvll) && vvll == 'null') return [ 'null', 'null', 'null', 'null', element ]; // don't fetch if vvll=null (we don't want that)
		let stageParts = stage.split('-');
		let elemParts = CsvUtils.splitX(element, FileUtils.separator, 1);
		let binHead = EndevorRestApi.getBinaryHeader(config);
		let eleURL = `env/${stageParts[0]}/stgnum/${stageParts[1]}/sys/${stageParts[2]}/subsys/${stageParts[3]}/`
			+ `type/${encodeURIComponent(elemParts[0])}/ele/${encodeURIComponent(elemParts[1])}?noSignout=yes`;
		if (!isNullOrUndefined(vvll)) eleURL += `&version=${vvll.substr(0, 2)}&level=${vvll.substr(2)}`;
		if (search)	eleURL += "&search=yes";

		try {
			const response: IRestResponse = await EndevorRestApi.getHttp(config.repoURL + eleURL, binHead);

			let jsonBody;
			// check if error, or not found
			if (!isNullOrUndefined(response.status) && response.status != 200 ) {
				try {
					// parse body, there will be messages
					jsonBody = JSON.parse(response.body);
				} catch (err) {
					console.error("json parsing error: " + err);
					return [ 'null', 'null', 'null', 'null', element ];
				}
				if (response.status != 206) {
					console.error(`Error obtaining element from url '${eleURL}':\n${jsonBody.messages}`);
				} else {
					// console.warn(`Element '${element}' deleted from stage '${stage}'...`);
					return [ 'del', 'null', 'null', 'null', element ];
				}
				return [ 'null', 'null', 'null', 'null', element ];
			}
			// element obtained, write it into file
			const body: Buffer = response.body;
			const fingerprint: any = response.headers["fingerprint"];
			const sha1 = await EdoCache.addSha1Object(body, EdoCache.OBJ_BLOB);

			return [ sha1, sha1, fingerprint, 'null', element ]; // index list format
		} catch (err) {
			console.error(`Exception when obtaining element '${element}' from stage '${stage}':\n${err}`);
			return [ 'null', 'null', 'null', 'null', element ];
		}
	}

	/**
	 * Fetch element history from Endevor (do print with history action) and save it as sha1 in Edo database.
	 *
	 * @param config ISettings from config file
	 * @param stage string in format `env-stgnum-system-subsystem`
	 * @param element name in format `typeName/eleName` (last item in index list)
	 * @returns array `[ null, null, null, sha1, element ]`, if not found or error `[ null, null, null, null, element ]`
	 */
	public static async fetchHistory(config: ISettings, stage: string, element: string): Promise<string[]> {
		const stageParts = stage.split('-');
		const elemParts = CsvUtils.splitX(element, FileUtils.separator, 1);
		const textHead = EndevorRestApi.getTextHeader(config);
		let eleURL = `env/${stageParts[0]}/stgnum/${stageParts[1]}/sys/${stageParts[2]}/subsys/${stageParts[3]}/`
			+ `type/${encodeURIComponent(elemParts[0])}/ele/${encodeURIComponent(elemParts[1])}?noHeadings=yes&print=history`;

		try {
			const response: IRestResponse = await EndevorRestApi.getHttp(config.repoURL + eleURL, textHead);

			let jsonBody;
			// check if error, or not found
			if (!isNullOrUndefined(response.status) && response.status != 200 ) {
				try {
					// parse body, there will be messages
					jsonBody = JSON.parse(response.body);
				} catch (err) {
					console.error("json parsing error: " + err);
					return [ 'null', 'null', 'null', 'null', element ];
				}
				if (response.status != 206) {
					console.error(`Error obtaining element history from url '${eleURL}':\n${jsonBody.messages}`);
				} else {
					// console.warn(`Element '${element}' deleted from stage '${stage}'...`);
					return [ 'null', 'null', 'null', 'del', element ];
				}
				return [ 'null', 'null', 'null', 'null', element ];
			}
			// element history obtained, write it into file
			const body: Buffer = response.body;
			const sha1 = await EdoCache.addSha1Object(body, EdoCache.OBJ_LOGS);

			return [ 'null', 'null', 'null', sha1, element ]; // index list format
		} catch (err) {
			console.error(`Exception when obtaining element history '${element}' from stage '${stage}':\n${err}`);
			return [ 'null', 'null', 'null', 'null', element ];
		}
	}

	/**
	 * Fetch list of types for stage(subsystem) from Endevor repo specified in config file.
	 * Store it in database and return sha1 id of it.
	 *
	 * @param config ISettings from config file
	 * @param stage string in format 'env-stgnum-system-subsystem'
	 * @returns sha1 of object containing list of types
	 */
	public static async fetchTypes(config: ISettings, stage: string): Promise<string> {
		let stageParts = stage.split('-');
		let listHead = EndevorRestApi.getJsonHeader(config);
		const listType = `env/${stageParts[0]}/stgnum/${stageParts[1]}/sys/${stageParts[2]}/type`;

		const response: IRestResponse = await EndevorRestApi.getHttp(config.repoURL + listType, listHead);
		let resBody;
		try {
			resBody = JSON.parse(response.body);
		} catch (err) {
			throw new Error("type json parsing error: " + err);
		}
		if (!isNullOrUndefined(response.status) && response.status > 300 ) {
			throw new Error(`Error obtaining type list for stage '${stage}':\n${resBody.messages}`);
		}
		let result = resBody.data;
		if (!isNullOrUndefined(result)) {
			if (isNullOrUndefined(result[0])) {
				result = [];
				result[0] = resBody.data;
			}
		}

		let typeStr: string[] = [];
		for (const type of result) {
			typeStr.push(`${type.typeName},${type.dataFm},${parseInt(type.srcLgt)}`);
		}
		return EdoCache.addSha1Object(Buffer.from(typeStr.join('\n')), EdoCache.OBJ_TYPE);
	}
}
