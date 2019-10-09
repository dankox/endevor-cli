import yargs from 'yargs';
import { FileUtils as fu } from "./utils/FileUtils";
import { isNullOrUndefined } from 'util';
import { HashUtils as hash } from "./utils/HashUtils";
import { ISettings } from './doc/ISettings';

export class EdoStatus {
	// private static readonly edoStatusFile : yargs.PositionalOptions = {
	// 	describe: 'Name of file (element.type) to pull from remote Endevor',
	// }

	// public static edoPullOptions = {
	// 	file: EdoStatus.edoStatusFile
	// }


	/**
	 * status
	 */
	public static async status(argv: any) {
		let setting: ISettings = await fu.readSettings();
		let stage = await fu.getStage();

		console.log(`On stage: ${stage}`);
		getChanges();

	}

}

async function getChanges() {
		// check if currently checked out stage (and remove from work dir)
		if (await fu.exists(`${fu.edoDir}/${fu.stageFile}`)) {
			let currentStage = await fu.getStage();
			try {
				// get if exists...
				let eleList = await fu.getEleListFromStage(currentStage);
				let lines = Object.values(eleList);
				let dirs: string[] = [];
				let files: string[] = [];
				let hasChanges: boolean = false;

				// walk thru elements and check changes
				for (let item of lines) {
					let tmpItem = fu.splitX(item, ',', 4);
					let eleParts = fu.splitX(tmpItem[4], '-', 1);
					let file = `./${eleParts[0]}/${eleParts[1]}`;
					if (!await fu.exists(file)) {
						if (tmpItem[0] == 'lsha1' && tmpItem[1] == 'rsha1') {
							continue; // doesn't exists in work directory, local or in remote
							// should do fetch, but not sure if message should be shown
						}
						console.log(`deleted... '${file}'`);
						hasChanges = true;
						continue; // next one... sha1 check not necessary
					}
					try {
						let lsha1 = await hash.getFileHash(file);
						if (tmpItem[0] != 'lsha1') {
							if (lsha1 != tmpItem[0]) {
								// changes against local
								console.log(`modified... '${file}'`);
								hasChanges = true;
							}
						} else if (tmpItem[1] != 'rsha1') {
							if(lsha1 != tmpItem[1]) {
								// changes against remote
								console.log(`modified... '${file}'`);
								hasChanges = true;
							}
						} else {
							// TODO: new file ?? or deleted ??
						}
					} catch (err) {
						// error while reading file, so don't push it.
						continue;
					}
				}
				if (!hasChanges) {
					console.log("no changes detected.");
				}
			} catch (err) {
				// don't care if there is nothing fetched (index file don't exists)
			}
		} else {
			console.error("no stage file!");
		}

}