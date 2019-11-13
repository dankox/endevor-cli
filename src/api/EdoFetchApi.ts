import yargs from "yargs";
import { FileUtils as fu } from "./utils/FileUtils";
import { ISettings } from "./doc/ISettings";
import { EndevorRestApi } from "./utils/EndevorRestApi";
import { isNullOrUndefined } from "util";
import { IRestResponse } from "./doc/IRestResponse";
import { IEleList } from "./doc/IEleList";

/**
 * Endevor fetch remote stage to local
 */
export class EdoFetchApi {
	public static readonly listele: string = "env/*/stgnum/*/sys/*/subsys/*/type/*/ele";

	private static readonly ndvFetchAllOption : yargs.Options = {
		describe: 'Fetch all elements from the map',
		demand: false,
		boolean: true,
		alias: 'a'
	};

	public static ndvFetchOptions = {
		all: EdoFetchApi.ndvFetchAllOption
	};


	/**
	 *
	 * @param argv
	 */
	public static async fetch(argv: any) {
		// stage in array [ env, stgnum, sys, sub ]
		let setting: ISettings = await fu.readSettings();
		let stageDir = await fu.getStage();
		// let stageDir = (await fu.readfile(`${fu.edoDir}/${fu.stageFile}`)).toString()

		// set header (auth and accept)
		let authHead = EndevorRestApi.getAuthHeader(setting.cred64);
		let listHead = {
			"Accept": "application/json",
			...authHead
		};

		let stageArr: string[] = [];
		stageArr.push(stageDir);

		if (argv.all) {
			let subMap = await fu.getDataFromCSV(fu.subMapFile);
			stageDir = subMap[stageDir].split(',')[0];
			while (!stageDir.startsWith("0-0")) {
				stageArr.push(stageDir);
				stageDir = subMap[stageDir].split(',')[0];
			}
			await fu.rmrf(".ele");
		}

		const asyncGetElements = async (stageItem: string) => {
			let stage = stageItem.split('-');
			const listEle = `env/${stage[0]}/stgnum/${stage[1]}/sys/${stage[2]}/subsys/${stage[3]}/type/*/ele?data=BAS`; // basic is enough
			console.log(`getting list for ${stageItem}...`);
			let eles = await getElementList(setting.repoURL + listEle, listHead); // get list for index from remote
			let index_list: { [key: string]: string } = {};
			try {
				index_list = await fu.getEleListFromStage(stageItem); // get local index (for comparision)
			} catch (err) {
				// don't care, list remains empty
			}
			if (!isNullOrUndefined(eles)) {
				eles.forEach((ele: IEleList) => {
					// CSV line: `lsha1,rsha1,${ele.fingerprint},${ele.fileExt},${ele.typeName}-${ele.fullElmName}\n`; // old format
					// CSV line: `lsha1,rsha1,${ele.fingerprint},history_sha1,${ele.typeName}-${ele.fullElmName}\n`; // new format
					const key = `${ele.typeName}-${ele.fullElmName}`;
					if (!isNullOrUndefined(index_list[key])) {
						let tmpItem = fu.splitX(index_list[key], ',', 4); // lsha1,rsha1,fingerprint,hsha1,typeName-fullElmName (new version)
						if (tmpItem[2] != ele.fingerprint) {
							tmpItem[2] = "null"; // nullify fingerprint for pull (it pulls only null fingerprint)
							index_list[key] = tmpItem.join(','); // update index list
						}
					} else {
						// for non-existent index key, create new one
						index_list[key] = `lsha1,rsha1,null,null,${key}`;
					}
				});
				console.log(`writing list for ${stageItem}...`);
				return fu.writeEleList(`${fu.edoDir}/${fu.mapDir}/${stageItem}/${fu.index}`, index_list);
			} else {
				console.error("list not returned!");
			}
		};
		await Promise.all(stageArr.map(item => asyncGetElements(item)));

		console.log("fetch done!");
	}
}

async function getElementList(eleURL:string, headers: any): Promise<any[] | null> {
	try {
		const response: IRestResponse = await EndevorRestApi.getHttp(eleURL, headers);
		console.log("list obtained...");
		let resBody;
		try {
			resBody = JSON.parse(response.body);
		} catch (err) {
			console.error("json parsing error: " + err);
			return null;
		}
		if (!isNullOrUndefined(response.status) && response.status > 300 ) {
			console.error(`Error obtaining element list from url '${eleURL}':\n${resBody.messages}`);
			return null;
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
		console.error(`Exception when obtaining element list from url '${eleURL}':\n${err}`);
		return null;
	}
}

// Testing...
// NdvFetch.fetch({ all: true });
