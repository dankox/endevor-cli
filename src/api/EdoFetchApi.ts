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

/**
 * Endevor fetch remote stage to local
 */
export class EdoFetchApi {
	static readonly listele: string = "env/*/stgnum/*/sys/*/subsys/*/type/*/ele";

	/**
	 * Fetch elements/types for stage and config specified in parameters.
	 * Populates index file and store it in edo database.
	 * Updates refs file with up-to-date index sha1.
	 *
	 * @param config ISettings with repo URL and credentials
	 * @param stage name or sha1 to fetch. If sha1, stage name will be used from
	 * already existed index (referenced by sha1 id).
	 */
	public static async fetchStage(config: ISettings, stage: string) {
		let index: IEdoIndex | null = null;
		let indexSha1: string | null = null;
		// if sha1, grab stage name from index file
		if (HashUtils.isSha1(stage)) {
			indexSha1 = stage;
			index = await EdoCache.readIndex(stage);
			stage = index.stgn;
		}
		// get element list and fetch types to database
		let [ eles, typeSha1 ] = await Promise.all([
			// get list for index from remote
			EdoFetchApi.getElementList(config, stage),
			// fetch list of types
			EdoFetchApi.fetchTypes(config, stage)
		]);

		let index_list: { [key: string]: string } = {};
		// read index to load index_list (if not read before)
		if (isNullOrUndefined(index)) {
			try {
				// get sha1 from refs
				indexSha1 = await FileUtils.readRefs(stage);
				// if exists read index and get list of elements
				if (indexSha1 != null) {
					index = await EdoCache.readIndex(indexSha1);
					index_list = index.elem;
					index.prev = indexSha1;
				} else {
					index = EdoIndex.init(stage);
				}
			} catch (err) {
				// don't care, list remains empty
				index = EdoIndex.init(stage);
			}
		} else {
			// get index_list from loaded index
			index_list = index.elem;
		}
		index.type = typeSha1;
		index.stat = EdoIndex.STAT_FETCHED; // set status to 'fetched'

		if (!isNullOrUndefined(eles)) {
			eles.forEach((ele: IEleList) => {
				// CSV line: `lsha1,rsha1,${ele.fingerprint},history_sha1,${ele.typeName}-${ele.fullElmName}\n`; // new format
				const key = `${ele.typeName}-${ele.fullElmName}`;
				if (!isNullOrUndefined(index_list[key])) {
					let tmpItem = CsvUtils.splitX(index_list[key], ',', 4); // lsha1,rsha1,fingerprint,hsha1,typeName-fullElmName (new version)
					if (tmpItem[2] != ele.fingerprint) {
						tmpItem[2] = "null"; // nullify fingerprint for pull (it pulls only null fingerprint)
						index_list[key] = tmpItem.join(','); // update index list
					}
				} else {
					// for non-existent index key, create new one
					index_list[key] = `lsha1,rsha1,null,null,${key}`;
				}
			});
			index.elem = index_list;
			console.log(`writing index for ${stage}...`);
			indexSha1 = await EdoCache.writeIndex(index);
			if (indexSha1 != null) FileUtils.writeRefs(stage, indexSha1); // update refs
			console.log(`fetch of ${stage} done!`);
		} else {
			// TODO: do I care? if there are no elements, nothing to update... or maybe delete ???
			console.error("no elements fetched!");
		}
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
		const listEle = `env/${stageParts[0]}/stgnum/${stageParts[1]}/sys/${stageParts[2]}/subsys/${stageParts[3]}/type/*/ele?data=BAS`; // basic is enough

		console.log(`getting element list for ${stage}...`);
		try {
			const response: IRestResponse = await EndevorRestApi.getHttp(config.repoURL + listEle, listHead);
			console.log("element list obtained...");
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

		console.log(`getting type list for ${stage}...`);
		const response: IRestResponse = await EndevorRestApi.getHttp(config.repoURL + listType, listHead);
		console.log("type list obtained...");
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
			typeStr.push(`${type.typeName},${type.dataFm},${type.srcLgt}`);
		}
		return EdoCache.addSha1Object(Buffer.from(typeStr.join('\n')), EdoCache.OBJ_TYPE);
	}
}
