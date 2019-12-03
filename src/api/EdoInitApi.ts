import { EndevorRestApi } from "./utils/EndevorRestApi";
import { FileUtils as fu } from './utils/FileUtils';
import { ISettings } from './doc/ISettings';
import { CsvUtils } from "./utils/CsvUtils";

/**
 * Endevor initialize local repo API
 *
 * @export
 * @class NdvInit
 */
export class EdoInitApi {
	public static readonly stages: string = "env/*/stgnum";
	public static readonly systems: string = "env/*/stgnum/*/sys";
	public static readonly subsystems: string = "env/*/stgnum/*/sys/*/subsys";

	/**
	 * Setup initial repository for Endevor specified URL (enws + instance)
	 *
	 * @param repoUrl repository url (http://localhost:8080/EndevorService/rest/CONFIG)
	 * @param cred64 credentials 'user:pass' in base64 encoding (for Basic Auth)
	 */
	public static async init(repoUrl: string, cred64: string) {
		console.log("initializing local repo");

		// check if it is already a repo
		// if (await fu.isNdvDir()) {
		// 	console.error("Current directory is already initialized repo!");
		// 	process.exit(1);
		// }

		// check ending slash (just in case)
		if (repoUrl.slice(-1) !== "/"){
			repoUrl = repoUrl + "/";
		}

		// setup local repo config
		console.log("setting up local repo...");
		let settings: ISettings = {
			repoURL: repoUrl,
			cred64: cred64
		};
		await fu.writeSettings(settings);

		// setup subsystem map with currentStage,nextStage,entryStg(1/0)
		await EdoInitApi.setupSubMap(settings);

		console.log("End of the init!");
	}


	/**
	 * Update submap so it contains fully specified next subsystem
	 * @param config settings
	 * @throws Error
	 */
	public static async setupSubMap(config: ISettings) {
		await Promise.all([
			// get map of stages
			EdoInitApi.getRepoMap(config),
			// get map of systems
			EdoInitApi.getSysMap(config),
			// get map of subsystems
			EdoInitApi.getSubMap(config)
		]);

		let stageMap = await CsvUtils.getDataFromCSV(fu.stageMapFile);
		// data example: RWRK-1,RWRK-2,1
		let sysMap = await CsvUtils.getDataFromCSV(fu.sysMapFile);
		// data example: RWRK-1-IDMS190,IDMS190
		let subMap = await CsvUtils.getDataFromCSV(fu.subMapFile);
		// data example: RWRK-1-IDMS190-DEFJE01P,LATTE

		let output: string = "";
		// create from RWRK-2-IDMS190-DEFJE01P,LATTE full spec of the next subsystem in map
		Object.keys(subMap).forEach((keySub: string) => {
			const subloc = keySub.split('-');
			const stgIdx = `${subloc[0]}-${subloc[1]}`;
			const stgVal = stageMap[stgIdx].split(',');
			const sysIdx = `${subloc[0]}-${subloc[1]}-${subloc[2]}`;
			const sysNext = sysMap[sysIdx];
			// get next subsystem only for the stage number 2 which maps to other environment
			const newSubLoc = `${stgVal[0]}-${sysNext}-` + (subloc[1] == '1' ? subloc[3] : subMap[keySub]);
			output += `${keySub},${newSubLoc},${stgVal[1]}\n`;
		});
		return fu.writeFile(fu.edoDir + "/" + fu.subMapFile, Buffer.from(output));
	}

	/**
	 * Get repository map (stage list)
	 * @param stageURL endpoint for list stage
	 * @param headers
	 */
	public static async getRepoMap(config: ISettings) {
		const stageURL = config.repoURL + EdoInitApi.stages;
		const headers = EndevorRestApi.getJsonHeader(config);
		console.log("getting repo map...");
		const response = await EndevorRestApi.getHttp(stageURL, headers);
		let resBody: any = JSON.parse(response.body);
		if (response.status != 200) {
			// console.error(`Error obtaining map:\n${resBody.messages}`);
			// process.exit(1);
			throw new Error(`Error obtaining map:\n${resBody.messages}`);
		}
		console.log("writing repo map...");
		await CsvUtils.writeStageMap(resBody.data);
	}

	/**
	 * Get system map (temporary list for final map)
	 *
	 * @param sysURL
	 * @param headers
	 */
	public static async getSysMap(config: ISettings) {
		const sysURL = config.repoURL + EdoInitApi.systems;
		const headers = EndevorRestApi.getJsonHeader(config);
		console.log("getting systems...");
		const response = await EndevorRestApi.getHttp(sysURL, headers);
		let resBody = JSON.parse(response.body);
		if (response.status != 200) {
			// console.error(`Error obtaining systems:\n${resBody.messages}`);
			// process.exit(1);
			throw new Error(`Error obtaining systems:\n${resBody.messages}`);
		}
		console.log("writing systems...");
		await CsvUtils.writeSysMap(resBody.data);
	}

	public static async getSubMap(config: ISettings) {
		const subURL = config.repoURL + EdoInitApi.subsystems;
		const headers = EndevorRestApi.getJsonHeader(config);
		console.log("getting subsystems...");
		const response = await EndevorRestApi.getHttp(subURL, headers);
		let resBody = JSON.parse(response.body);
		if (response.status != 200) {
			// console.error(`Error obtaining subsystems:\n${resBody.messages}`);
			// process.exit(1);
			throw new Error(`Error obtaining subsystems:\n${resBody.messages}`);
		}
		console.log("writing subsystems...");
		await CsvUtils.writeSubMap(resBody.data);
	}

}
