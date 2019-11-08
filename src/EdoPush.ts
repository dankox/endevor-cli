import yargs from 'yargs';
import { FileUtils as fu } from "./utils/FileUtils";
import { isNullOrUndefined } from 'util';
import { ISettings } from './doc/ISettings';
import { IRestResponse } from './doc/IRestResponse';
import { EndevorRestApi } from './utils/EndevorRestApi';

/**
 * Endevor pull sources from remote location
 */
export class EdoPush {
	private static readonly edoPushFile : yargs.PositionalOptions = {
		describe: 'Name of file (element.type) to push to remote Endevor',
		type: "string"
	};

	private static readonly edoPushMessage : yargs.Options = {
		describe: 'Message will be parsed as ccid and comment and used in Endevor (parsing is by space)',
		demand: true,
		alias: "m",
		type: "string"
	};

	public static edoPushOptions = {
		file: EdoPush.edoPushFile,
		message: EdoPush.edoPushMessage
	};


	/**
	 * pull
	 */
	public static async push(argv: any) {
		let setting: ISettings = await fu.readSettings();
		let stage = await fu.getStage();
		let authHead = EndevorRestApi.getAuthHeader(setting.cred64);
		let pushHead = {
			"Accept": "application/json",
			...authHead
		};


		let file: string = argv.file;
		let msgA: string[] = fu.splitX(argv.message, ' ', 1);
		let ccid: string = msgA[0].substr(0, 12); // ccid length 12
		let comment: string = msgA[1].substr(0, 40); // comment length 40

		let file_list: {[key: string]: string } = {}; // list for upload
		let index_list: {[key: string]: string } = {}; // list from index file
		try {
			index_list = await fu.getEleListFromStage(stage);
		} catch (err) {
			console.error("no index file!"); // don't stop
		}
		if (isNullOrUndefined(file)) {
			file_list = index_list;
		} else {
			if (await fu.exists(file)) {
				// get the final full file name in proper format
				if (file.startsWith(".ele/")) {
					let fn: string[] = file.split('/');
					file = fn[1].split('.').reverse().join('-');
				} else if (file.startsWith(".ele\\")) {
					let fn = file.split('\\');
					file = fn[1].split('.').reverse().join('-');
				} else {
					let fn = (file.indexOf('/') > 0 ? file.split('/') : file.split('\\'));
					file = `${fn[0]}-${fn[1]}`;
				}
				file_list[file] = index_list[file]; // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName from index
			} else {
				console.error(`Don't know this file '${file}'!`);
				process.exit(1);
			}
		}

		let elements = Object.values(file_list);
		let pushedKeys: any[] = [];

		const asyncPushElement = async (element: string) => {
			if (isNullOrUndefined(element)) {
				console.error(`file '${element}' not in index... !!!ADD IMPLEMENTATION REQUIRED!!!`);
				return; // file wasn't in index TODO: add action????
			}
			const tmpItem = fu.splitX(element, ',', 4);
			if (tmpItem[0] != 'lsha1' && tmpItem[0] != tmpItem[1]) { // push only locally updated files
				const key = await pushElement(setting.repoURL, stage, tmpItem[4], tmpItem[0], ccid, comment, tmpItem[2], pushHead);
				if (!isNullOrUndefined(key))
					pushedKeys.push(key);
			}
		};
		process.stdout.write("pushing elements...");
		await Promise.all(elements.map(item => asyncPushElement(item)));
		console.log(" "); // new line to console log

		// update index
		pushedKeys.forEach(key => {
			if (isNullOrUndefined(index_list[key.element])) return; // something weird is going on (should be in index)
			let tmp = fu.splitX(index_list[key.element], ',', 4); // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName (new version)
			tmp[1] = tmp[0]; // rsha1 is equal to lsha1 (almost, spaces screw it, but it should be the same element)
			tmp[2] = key.fingerprint; // fingerprint
			index_list[key.element] = tmp.join(','); // update index with new fingerprint
		});

		// update index list
		let output: string[] = Object.values(index_list);
		await fu.writefile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.index}`, Buffer.from(output.join("\n")));
		console.log("push done!");
	}

}

async function pushElement(repoURL: string, stage: string, element: string, file: string, ccid: string, comment: string, finger: string, headers: any) {
	try {
		let stageParts = stage.split('-');
		let elemParts = fu.splitX(element, '-', 1);
		file = `${fu.edoDir}/${fu.mapDir}/${stage}/${fu.remote}/${file}`;
		let eleURL = `env/${stageParts[0]}/stgnum/${stageParts[1]}/sys/${stageParts[2]}/subsys/${stageParts[3]}/type/${elemParts[0]}/ele/` + encodeURIComponent(elemParts[1]);
		const response: IRestResponse = await EndevorRestApi.addElementHttp(repoURL + eleURL, file, ccid, comment, finger, headers);
		process.stdout.write('.');

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
				console.error(`Error pushing file ${elemParts[0]}/${elemParts[1]}:\n${jsonBody.messages}`);
			} else {
				console.warn(`No changes detected in Endevor for file ${elemParts[0]}/${elemParts[1]}:\n${jsonBody.messages}`);
			}
			return null;
		}
		// element pushed, save new fingerprint
		let fingerprint: any = response.headers["fingerprint"];

		return { fingerprint: fingerprint, element: element };
	} catch (err) {
		console.error(`Exception when pushing element '${element}' from stage '${stage}':\n${err}`);
		return null;
	}
}
