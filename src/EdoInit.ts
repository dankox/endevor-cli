import { EndevorRestApi } from "./utils/EndevorRestApi";
import { FileUtils as fu } from './utils/FileUtils';
import { ConsoleUtils as cu } from './utils/ConsoleUtils';
import { ISettings } from './doc/ISettings';
import yargs from 'yargs';
import { isNullOrUndefined } from "util";

/**
 * Endevor initialize local repo from remote URL
 *
 * @export
 * @class NdvInit
 */
export class EdoInit {
	public static readonly auth: string = "auth";
	public static readonly stages: string = "env/*/stgnum";
	public static readonly systems: string = "env/*/stgnum/*/sys";
	public static readonly subsystems: string = "env/*/stgnum/*/sys/*/subsys";

	private static readonly edoInitUrlOptions : yargs.PositionalOptions = {
		describe: 'Full remote URL of Endevor repo (e.g. http://localhost:8080/EndevorService/rest/CONFIG)'
	};

	private static readonly edoInitUserOptions : yargs.Options = {
		describe: 'Username',
		demand: false,
		alias: 'u'
	};

	private static readonly edoInitPassOptions : yargs.Options = {
		describe: 'Password',
		demand: false,
		alias: 'p'
	};

	public static edoInitOptions = {
		url: EdoInit.edoInitUrlOptions,
		user: EdoInit.edoInitUserOptions,
		pass: EdoInit.edoInitPassOptions
	};

	/**
	 *
	 * @param argv
	 */
	public static async init(argv: any) {
		console.log("initializing local repo");

		// check if it is already a repo
		// if (await fu.isNdvDir()) {
		// 	console.error("Current directory is already initialized repo!");
		// 	process.exit(1);
		// }

		// validate URL
		let repoURL;
		try {
			repoURL = argv.url;
			if (repoURL.slice(-1) !== "/"){
				repoURL = repoURL + "/";
			}
		} catch (err) {
			console.error("Error when parsing URL: " + err);
			process.exit(1);
		}

		// verify instance (if exists)
		console.log(`verifying url (${repoURL})...`);
		let response = await EndevorRestApi.getHttp(repoURL.slice(0, -1)); // with slash at the end it needs authorization header
		if (response.status != 200) {
			console.error(`Instance ${argv.instance} doesn't exists`);
			process.exit(1);
		}

		// verify credentials
		console.log(`verifying credentials...`);
		let cred64 = '';
		try {
			cred64 = await cu.verifyCredentials(repoURL, argv.user, argv.pass);
		} catch (err) {
			console.error("Error while verifying credentials.\n" + err);
			process.exit(1);
		}
		let headers = EndevorRestApi.getAuthHeader(cred64);
		headers = {
			"Accept": "application/json",
			...headers
		};

		// setup local repo config
		console.log("setting up local repo...");
		let settings: ISettings = {
			repoURL: repoURL,
			cred64: cred64,
			instance: argv.instance
		};
		await fu.writeSettings(settings);

		await Promise.all([
			// get map of stages
			getRepoMap(repoURL + EdoInit.stages, headers),
			// get map of systems
			getSysMap(repoURL + EdoInit.systems, headers),
			// get map of subsystems
			getSubMap(repoURL + EdoInit.subsystems, headers)
		]);

		// setup subsystem map with currentStage,nextStage,entryStg(1/0)
		await setupSubMap();

		console.log("End of the init!");
	}

}

async function getRepoMap(stageURL: string, headers: any) {
	console.log("getting repo map...");
	const response = await EndevorRestApi.getHttp(stageURL, headers);
	let resBody: any = JSON.parse(response.body);
	if (response.status != 200) {
		console.error(`Error obtaining map:\n${resBody.messages}`);
		process.exit(1);
	}
	console.log("writing repo map...");
	await fu.writeMap(resBody.data);
}

async function getSysMap(sysURL: string, headers: any) {
	console.log("getting systems...");
	const response = await EndevorRestApi.getHttp(sysURL, headers);
	let resBody = JSON.parse(response.body);
	if (response.status != 200) {
		console.error(`Error obtaining systems:\n${resBody.messages}`);
		process.exit(1);
	}
	console.log("writing systems...");
	await fu.writeSysMap(resBody.data);
}

async function getSubMap(subURL:string, headers: any) {
	console.log("getting subsystems...");
	const response = await EndevorRestApi.getHttp(subURL, headers);
	let resBody = JSON.parse(response.body);
	if (response.status != 200) {
		console.error(`Error obtaining subsystems:\n${resBody.messages}`);
		process.exit(1);
	}
	console.log("writing subsystems...");
	await fu.writeSubMap(resBody.data);
}

/**
 * Update submap so it contains fully specified next subsystem
 */
async function setupSubMap() {
	let stageMap = await fu.getDataFromCSV(fu.stageMapFile);
	// data example: RWRK-1,RWRK-2,1
	let sysMap = await fu.getDataFromCSV(fu.sysMapFile);
	// data example: RWRK-1-IDMS190,IDMS190
	let subMap = await fu.getDataFromCSV(fu.subMapFile);
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
	return fu.writefile(fu.edoDir + "/" + fu.subMapFile, Buffer.from(output));
}

// Test
// EdoInit.init({url: "http://ca31.ca.com:9009/EndevorService/rest/ENWSTSTC"});
