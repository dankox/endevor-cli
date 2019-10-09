import yargs from "yargs";
import { FileUtils as fu } from "./utils/FileUtils";
import path from "path";
import { isNullOrUndefined } from "util";

/**
 * Endevor restore working directory to local or remote (like discard)
 */
export class EdoRestore {
	private static readonly edoRestoreFile : yargs.PositionalOptions = {
		describe: 'File name which should be restored'
	};

	public static edoRestoreOptions = {
		file: EdoRestore.edoRestoreFile
	};


	/**
	 *
	 * @param argv
	 */
	public static async restore(argv: any) {
		// TODO: restore local to remote (currently only workdir to commited/pulled)
		let stage = await fu.getStage();

		let eleList: { [key: string]: string } = {};
		try {
			eleList = await fu.getEleListFromStage(stage);
		} catch (err) {
			// file doesn't exists or read error, skip updating working tree
			console.log("There is no index for this stage, nothing to restore.");
			process.exit(0);
		}

		let localStageDir = `${fu.edoDir}/${fu.mapDir}/${stage}`;
		if (!isNullOrUndefined(argv.file)) {
			let fileRestore: string = argv.file;
			if (!await fu.exists(fileRestore)) {
				console.error(`File '${fileRestore}' doesn't exists!`);
				process.exit(1);
			}
			let dirRestore: string = path.dirname(fileRestore);
			fileRestore = path.basename(fileRestore);
			dirRestore = path.basename(dirRestore);
			let elementIdx = `${dirRestore}-${fileRestore}`;
			await restoreFile(localStageDir, eleList[elementIdx]);
			console.log("file restored!");
		} else {
			let lines = Object.values(eleList);
			for (let item of lines) {
				await restoreFile(localStageDir, item);
			}
			console.log("stage restored!");
		}
	}

}

async function restoreFile(stagePath: string, csvItem: string) {
	if (isNullOrUndefined(csvItem)) {
		return; // non-existent
	}
	let tmpItem = fu.splitX(csvItem, ',', 4);  // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName
	let eleParts = fu.splitX(tmpItem[4], '-', 1);
	let file = `./${eleParts[0]}/${eleParts[1]}`;
	try {
		if (tmpItem[0] != 'lsha1') { // get latest local version (if exists)
			await fu.copyFile(`${stagePath}/${fu.remote}/${tmpItem[0]}`, file);
		} else if (tmpItem[1] != 'rsha1') { // if not, get remote version (if exists)
			await fu.copyFile(`${stagePath}/${fu.remote}/${tmpItem[1]}`, file);
		} else { // if doesn't exists, don't restore
			// noFiles.push(file);
		}
	} catch (err) { // error during copy file
		console.error(`Error restoring file '${file}': ${err}`);
	}
}
