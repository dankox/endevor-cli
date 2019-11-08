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
		type: "string"
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


		let file: string = argv.file;
		let search: boolean = false;
		let forceFile: boolean = false;

		let file_list: {[key: string]: string } = {}; // list for download
		let index_list: {[key: string]: string } = {}; // list from index file
		let orig_base_list: {[key: string]: string } = {}; // list created when pulled to store original rsha1 (for base)
		try {
			index_list = await fu.getEleListFromStage(stage);
		} catch (err) {
			console.error("no index file!"); // don't stop
		}
		if (isNullOrUndefined(file)) {
			file_list = index_list;
		} else {
			forceFile = true; // force pull when file specified
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
				file_list[file] = `lsha1,rsha1,null,null,${file}`; // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName
				search = true;
			} else {
				console.error(`Don't know this file '${file}'!`);
				process.exit(1);
			}
		}

		let elements = Object.keys(file_list);
		let pulledKeys: any[] = [];

		const asyncGetElement = async (element: string) => {
			let tmpItem = fu.splitX(file_list[element], ',', 4); // lsha1,rsha1,fingerprint,hsha1,typeName-fullElmName
			if (tmpItem[2] != 'null' && !forceFile) return; // do not pull for existing fingerprint unless file specified
			const key = await getElement(setting.repoURL, stage, element, pullHead, search);
			if (!isNullOrUndefined(key))
				pulledKeys.push(key);
		};
		process.stdout.write("pulling elements...");
		await Promise.all(elements.map(item => asyncGetElement(item)));
		console.log(" "); // new line to console log

		// update index
		pulledKeys.forEach(key => {
			const keyParts = fu.splitX(key, ',', 2); // sha1,fingerprint,type-element
			const listLine = isNullOrUndefined(index_list[keyParts[2]]) ? file_list[keyParts[2]] : index_list[keyParts[2]];
			let tmp = fu.splitX(listLine, ',', 4); // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName (new version)
			if (tmp[1] != 'rsha1')
				orig_base_list[keyParts[2]] = tmp[1]; // save original rsha1 for later merge (as base)
			tmp[1] = keyParts[0]; // remote-sha1
			tmp[2] = keyParts[1]; // fingerprint
			index_list[keyParts[2]] = tmp.join(','); // update index with new rsha1 and fingerprint
		});

		// update index list
		let output: string[] = Object.values(index_list);
		await fu.writefile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.index}`, Buffer.from(output.join("\n")));
		console.log("pull done!");

		// Merging... (go thru pulled files only)
		console.log("updating working directory...");
		for (let pullKey of pulledKeys) {
			const element = fu.splitX(pullKey, ',', 2)[2]; // sha1,fingerprint,type-element
			let elemParts = fu.splitX(element, '-', 1);
			let wdFile = `./${elemParts[0]}/${elemParts[1]}`;
			let tmpItem = fu.splitX(index_list[element], ',', 4); // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName
			// TODO: deleted?? should be merged somehow with local? conflict??
			if (tmpItem[1] == 'rsha1')
				continue; // for not pulled element, skip merge

			const workExist: boolean = await fu.exists(wdFile);
			if (tmpItem[0] == 'lsha1' && !workExist) { // if no local and doesn't exist in working directory copy it there
				try {
					await fu.copyFile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.remote}/${tmpItem[1]}`, wdFile);
					// save sha1 from remote to local
					tmpItem[0] = tmpItem[1];
					index_list[element] = tmpItem.join(','); // update index list
				} catch (err) {
					console.error(`Error while updating working directory element '${element}': ${err}`);
				}
			} else { // merge (if it has lsha1 or it already exists in workdir, create merge content)
				try {
					if (tmpItem[0] == 'lsha1' && workExist) {
						const lsha1 = await hash.getFileHash(wdFile);
						if (lsha1 == tmpItem[1]) continue; // for the same as remote, skip
					}
					if (isNullOrUndefined(orig_base_list[element])) {
						// TODO: do 2 way diff when don't have base (remote from before)
						// for no base, I should just show conflict, incomming and mine... <<< local === >>> remote
						// Currently no base, no merge, just overwrite local changes = =
						await fu.copyFile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.remote}/${tmpItem[1]}`, wdFile);
						if (workExist) {
							console.log(`'${wdFile}' in working directory overwritten, do 'edo diff' to see differences... (NOT TRACKED!!! MERGE DOESN'T WORK!!! probably ADD??)`);
						}
						continue;
					}
					let trimTrailingSpace = true;
					let baseStr = (await fu.readfile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.remote}/${orig_base_list[element]}`, trimTrailingSpace)).toString();
					const mineStr = (await fu.readfile(wdFile, trimTrailingSpace)).toString();
					const theirsStr = (await fu.readfile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.remote}/${tmpItem[1]}`, trimTrailingSpace)).toString();
					if (mineStr == baseStr) {
						// wdfile same as base, no local change => write remote to working directory
						await fu.copyFile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.remote}/${tmpItem[1]}`, wdFile);
						continue;
					}
					const mergearg: IMerge3way = {
						base: baseStr,
						mine: mineStr,
						theirs: theirsStr
					};
					let merged: string[] = EdoMerge.merge3way(mergearg);
					const isOk = merged.shift();
					// TODO: check the line endings, last line is not merged properly (last empty line)
					let tmpBuf: Buffer = Buffer.from(merged.join('\n'));
					// let lsha1 = hash.getHash(tmpBuf);
					await fu.writefile(`./${elemParts[0]}/${elemParts[1]}`, tmpBuf);
					if (isOk == 'conflict') {
						// lsha1 = 'x-' + lsha1; // TODO: ??? what to do how to mark it (maybe x- and use it also in status)
						console.error(`There is conflict in file ./${elemParts[0]}/${elemParts[1]}`);
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
		output = Object.values(index_list);
		fu.writefile(`${fu.edoDir}/${fu.mapDir}/${stage}/${fu.index}`, Buffer.from(output.join("\n")));
		console.log("update done!");
	}

}

async function getElement(repoURL: string, stage: string, element: string, headers: any, search: boolean = false) {
	// TODO: do get element only on elements which doesn't have rsha1
	// - this should happen (rsha1 update) when fetch is done (if fingerprint doesn't match)
	// - writeEleList needs to be updated too (because currently it always overrides)
	// - or doing validate fingerprint before?
	try {
		let stageParts = stage.split('-');
		let elemParts = fu.splitX(element, '-', 1);
		let eleURL = `env/${stageParts[0]}/stgnum/${stageParts[1]}/sys/${stageParts[2]}/subsys/${stageParts[3]}/type/${elemParts[0]}/ele/` + encodeURIComponent(elemParts[1]);
		eleURL += "?noSignout=yes";
		if (search)
			eleURL += "&search=yes";
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