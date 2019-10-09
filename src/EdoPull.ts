import yargs from 'yargs';
import { FileUtils as fu } from "./utils/FileUtils";
import { HashUtils as hash } from "./utils/HashUtils";
import { isNullOrUndefined } from 'util';
import { ISettings } from './doc/ISettings';
import { IRestResponse } from './doc/IRestResponse';
import { EndevorRestApi } from './utils/EndevorRestApi';
import { EdoMerge } from './EdoMerge';
import { IMerge3way } from './doc/IMerge3way';

/**
 * Endevor pull sources from remote location
 */
export class EdoPull {
	private static readonly edoPullFile : yargs.PositionalOptions = {
		describe: 'Name of file (element.type) to pull from remote Endevor',
	};

	public static edoPullOptions = {
		file: EdoPull.edoPullFile
	};


	/**
	 * pull
	 */
	public static async pull(argv: any) {
		let setting: ISettings = await fu.readSettings();
		let stage = await fu.getStage();
		let authHead = EndevorRestApi.getAuthHeader(setting.cred64);
		let pullHead = {
			"Accept": "application/octet-stream",
			...authHead
		};


		let file = argv.file;

		let file_list: {[key: string]: string } = {};
		if (isNullOrUndefined(file)) {
			file_list = await fu.getEleListFromStage(stage);
		} else {
			file_list["type-element"] = file; // 'type,null,null,sha1,element'
		}

		let elements = Object.keys(file_list);
		let pulledKeys: any[] = [];

		const asyncGetElement = async (element: string) => {
			const key = await getElement(setting.repoURL, stage, element, pullHead);
			if (!isNullOrUndefined(key))
				pulledKeys.push(key);
		};
		process.stdout.write("pulling elements...");
		await Promise.all(elements.map(item => asyncGetElement(item)));
		console.log(" "); // new line to console log

		pulledKeys.forEach(key => {
			const keyParts = fu.splitX(key, ',', 2); // sha1,fingerprint,type-element
			let tmp = fu.splitX(file_list[keyParts[2]], ',', 4); // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName (new version)
			// type,fileext,fingerprint,sha1,element (old version)
			tmp[1] = keyParts[0]; // remote-sha1
			tmp[2] = keyParts[1]; // fingerprint
			file_list[keyParts[2]] = tmp.join(',');
		});

		// update elements list
		let output: string[] = Object.values(file_list);
		await fu.writefile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.index}`, Buffer.from(output.join("\n")));
		console.log("pull done!");

		// Merging...
		console.log("updating working directory...");
		// get base files (if any) for merging if necessary
		let base_file_list: {[key: string]: string } = {}; // list of files which were base/root of local changes
		try {
			base_file_list = await fu.getEleListFromStage(stage, true);
		} catch (err) {
			// file probably doesn't exists
			// console.log("no base file: " + err);
		}

		// elements.forEach(async element => {
		for (let element of elements) {
			let elemParts = fu.splitX(element, '-', 1);
			let tmpItem = fu.splitX(file_list[element], ',', 4); // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName (new version)
			// TODO: deleted?? should be merged somehow with local? conflict??
			if (tmpItem[1] == 'rsha1')
				continue; // for not pulled element, skip merge

			if (tmpItem[0] == 'lsha1' || tmpItem[1] == tmpItem[0]) { // if remote-sha1 is the same as local-sha1
				try {
					await fu.copyFile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.remote}/${tmpItem[1]}`, `./${elemParts[0]}/${elemParts[1]}`);
					// save sha1 from remote to local
					tmpItem[0] = tmpItem[1];
					file_list[element] = tmpItem.join(',');
				} catch (err) {
					console.error(`Error while merging element '${element}': ${err}`);
				}
			} else { // merge
				try {
					const tmpFile = fu.splitX(base_file_list[element], ',', 2);
					const baseStr = (await fu.readfile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.remote}/${tmpFile[0]}`)).toString();
					const mineStr = (await fu.readfile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.remote}/${tmpItem[0]}`)).toString();
					const theirsStr = (await fu.readfile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.remote}/${tmpItem[1]}`)).toString();
					const mergearg: IMerge3way = {
						base: baseStr,
						mine: mineStr,
						theirs: theirsStr
					};
					let merged: string[] = EdoMerge.merge3way(mergearg);
					const isOk = merged.shift();
					let tmpBuf: Buffer = Buffer.from(merged.join('/n'));
					let lsha1 = hash.getHash(tmpBuf);
					await fu.writefile(`./${elemParts[0]}/${elemParts[1]}`, tmpBuf);
					if (isOk == 'conflict') {
						// lsha1 = 'x-' + lsha1; // TODO: ??? what to do how to mark it (maybe x- and use it also in status)
						console.error(`There is conflict in file ./${elemParts[0]}/${elemParts[1]}`);
					}
					tmpItem[0] = lsha1;
					file_list[element] = tmpItem.join(',');
				} catch (err) {
					console.error(`Error occurs during merge of '${element}': ${err}`);
				}
			}
		}

		// update elements list
		output = Object.values(file_list);
		fu.writefile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.index}`, Buffer.from(output.join("\n")));
		console.log("update done!");
	}

}

async function getElement(repoURL: string, stage: string, element: string, headers: any) {
	// TODO: do get element only on elements which doesn't have rsha1
	// - this should happen (rsha1 update) when fetch is done (if fingerprint doesn't match)
	// - writeEleList needs to be updated too (because currently it always overrides)
	// - or doing validate fingerprint before?
	try {
		let stageParts = stage.split('-');
		let elemParts = fu.splitX(element, '-', 1);
		let eleURL = `env/${stageParts[0]}/stgnum/${stageParts[1]}/sys/${stageParts[2]}/subsys/${stageParts[3]}/type/${elemParts[0]}/ele/` + encodeURIComponent(elemParts[1]);
		eleURL += "?noSignout=yes";
		const response: IRestResponse = await EndevorRestApi.getHttp(repoURL + eleURL, headers);
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
				console.error(`Error obtaining element from url '${eleURL}':\n${jsonBody.messages}`);
			} else {
				console.warn(`Element '${element}' not found in stage '${stage}', re-run 'edo fetch' or 'edo pull ${element}'`);
			}
			return null;
		}
		// element obtained, write it into file
		let body: Buffer = response.body;
		let fingerprint: any = response.headers["fingerprint"];
		let sha1 = hash.getHash(body);
		await fu.writefile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.remote}/${sha1}`, body);

		return `${sha1},${fingerprint},${element}`;
	} catch (err) {
		console.error(`Exception when obtaining element '${element}' from stage '${stage}':\n${err}`);
		return null;
	}
}


// Test
// EdoPull.pull({});