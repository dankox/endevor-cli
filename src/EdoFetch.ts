import yargs from "yargs";
import { FileUtils as fu } from "./utils/FileUtils";
import { ISettings } from "./doc/ISettings";
import { EndevorRestApi } from "./utils/EndevorRestApi";
import { isNullOrUndefined } from "util";
import { IRestResponse } from "./doc/IRestResponse";

/**
 * Endevor fetch remote stage to local
 */
export class EdoFetch {
	public static readonly listele: string = "env/*/stgnum/*/sys/*/subsys/*/type/*/ele";

	private static readonly ndvFetchAllOption : yargs.Options = {
		describe: 'Fetch all elements from the map',
		demand: false,
		boolean: true,
		alias: 'a'
	}

	public static ndvFetchOptions = {
		all: EdoFetch.ndvFetchAllOption
	}


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
		}

		let stageArr: string[] = [];
		stageArr.push(stageDir);

		if (argv.all) {
			let subMap = await fu.getDataFromCSV(fu.subMapFile);
			stageDir = subMap[stageDir].split(',')[0];
			while (!stageDir.startsWith("0-0")) {
				stageArr.push(stageDir);
				stageDir = subMap[stageDir].split(',')[0]
			}
			await fu.rmrf(".ele");
		}

		const asyncGetElements = async (stageItem: string) => {
			let stage = stageItem.split('-');
			const listEle = `env/${stage[0]}/stgnum/${stage[1]}/sys/${stage[2]}/subsys/${stage[3]}/type/*/ele`;
			console.log(`getting list for ${stageItem}...`);
			let eles = await getElementList(setting.repoURL + listEle, listHead);
			console.log(`writing list for ${stageItem}...`);
			return fu.writeEleList(`${fu.edoDir}/${fu.mapDir}/${stageItem}/${fu.elementsFile}`, eles);
		};
		await Promise.all(stageArr.map(item => asyncGetElements(item)));

		console.log("fetch finished!");
	}
}

async function getElementList(eleURL:string, headers: any) {
	try {
		const response: IRestResponse = await EndevorRestApi.getHttp(eleURL, headers);
		console.log("list obtained...")
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
