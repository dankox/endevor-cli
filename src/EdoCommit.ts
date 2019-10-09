import yargs from "yargs";
import { FileUtils as fu } from "./utils/FileUtils";
import path from "path";
import { isNullOrUndefined } from "util";
import { HashUtils as hash } from "./utils/HashUtils";

/**
 * Endevor restore working directory to local or remote (like discard)
 */
export class EdoCommit {
	private static readonly edoCommitFile : yargs.PositionalOptions = {
		describe: 'File name which you want to commit to local stage'
	};

	public static edoCommitOptions = {
		file: EdoCommit.edoCommitFile
	};


	/**
	 *
	 * @param argv
	 */
	public static async commit(argv: any) {
		// TODO: restore local to remote (currently only workdir to commited/pulled)
		let stage = await fu.getStage();

		let eleList: { [key: string]: string } = {};
		try {
			eleList = await fu.getEleListFromStage(stage);
		} catch (err) {
			// index doesn't exists, this should work only if file argument is specified
			console.log("There is no index for this stage, new will be created.");
			console.log("Currently not working!!!");
			process.exit(0);
		}

		let localStageDir = `${fu.edoDir}/${fu.mapDir}/${stage}`;
		// if (!isNullOrUndefined(argv.file)) {
		// 	let fileRestore: string = argv.file;
		// 	if (!await fu.exists(fileRestore)) {
		// 		console.error(`File '${fileRestore}' doesn't exists!`);
		// 		process.exit(1);
		// 	}
		// 	let dirRestore: string = path.dirname(fileRestore);
		// 	fileRestore = path.basename(fileRestore);
		// 	dirRestore = path.basename(dirRestore);
		// 	let elementIdx = `${dirRestore}-${fileRestore}`;
		// 	await restoreFile(localStageDir, eleList[elementIdx]);
		// 	console.log("file restored!");
		// } else {

		let lines = Object.values(eleList);
		let hasChanges: boolean = false;
		// for (let item of lines) {
		// 	await commitFile(localStageDir, item);
		// }
		for (let item of lines) {
			let tmpItem = fu.splitX(item, ',', 4);
			let eleParts = fu.splitX(tmpItem[4], '-', 1);
			let file = `./${eleParts[0]}/${eleParts[1]}`;
			if (!await fu.exists(file)) {
				if (tmpItem[0] == 'lsha1' && tmpItem[1] == 'rsha1') {
					continue; // doesn't exists in work directory, local or in remote
				}
				console.log(`'${file}' deleted... !!! DOESN'T WORK NOW!!!`); // TODO: not working currently (not sure how to handle deletion)
				hasChanges = true;
				continue; // next one... sha1 check not necessary
			}
			try {
				let lsha1 = await hash.getFileHash(file);
				if (tmpItem[0] != 'lsha1') {
					if (lsha1 != tmpItem[0]) {
						// changes against local
						console.log(`'${file}' changed...`);
						await fu.copyFile(file, `${localStageDir}/${fu.remote}/${lsha1}`);
						tmpItem[0] = lsha1; // update local hash
						hasChanges = true;
					}
				} else if (tmpItem[1] != 'rsha1') {
					if (lsha1 != tmpItem[1]) {
						// changes against remote
						console.log(`'${file}' changed...`);
						await fu.copyFile(file, `${localStageDir}/${fu.remote}/${lsha1}`);
						tmpItem[0] = lsha1; // update local hash (not remote!!!)
						hasChanges = true;
					}
				} else {
					// TODO: nothing in local or remote ??? (new file? deleted and readded???)
				}
				eleList[tmpItem[4]] = tmpItem.join(',');
			} catch (err) {
				// error while reading file, so don't commit it.
				console.error(`Error reading file '${file}: ${err}`);
				continue;
			}
		}

		if (hasChanges) {
			// update elements list
			lines = Object.values(eleList);
			fu.writefile(`${localStageDir}/${fu.index}`, Buffer.from(lines.join("\n")));
			console.log("changes commited to local stage!");
		} else {
			console.log("no changes to commit to local stage!");
		}

		// }
	}

}