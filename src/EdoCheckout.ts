import yargs from "yargs";
import { FileUtils as fu } from "./utils/FileUtils";
import { HashUtils as hash } from "./utils/HashUtils";

/**
 * Endevor checkout stage (on local)
 */
export class EdoCheckout {
	private static readonly edoCheckoutStage : yargs.PositionalOptions = {
		describe: 'Name of stage to checkout (env-stg-sys-sub)'
	};

	public static edoCheckoutOptions = {
		stage: EdoCheckout.edoCheckoutStage
	};


	/**
	 *
	 * @param argv
	 */
	public static async checkout(argv: any) {
		let stage: string = argv.stage;

		// TODO: if nonexistent directory but in directory version like (error)
		if (await fu.exists(stage)) {
			// get the final full stage in env-stg-sys-sub format
			if (stage.startsWith(".map/")) {
				let dirs = stage.split('/');
				if (dirs.length > 4)
					dirs = dirs.slice(0, 4);
				stage = dirs.slice(1).join('-');
			} else if (stage.startsWith(".map\\")) {
				let dirs = stage.split('\\');
				if (dirs.length > 4)
					dirs = dirs.slice(0, 4);
				stage = dirs.slice(1).join('-');
			}
		}

		// check if currently checked out stage (and remove from work dir)
		if (await fu.exists(`${fu.edoDir}/${fu.stageFile}`)) {
			let currentStage = await fu.getStage();
			try {
				// get if exists...
				let eleList = await fu.getEleListFromStage(currentStage);
				let lines = Object.values(eleList);
				let dirs: string[] = [];
				let files: string[] = [];
				let saveChanges: boolean = false;

				// walk thru elements and check if can be removed
				for (let item of lines) {
					let tmpItem = fu.splitX(item, ',', 4);
					let eleParts = fu.splitX(tmpItem[4], '-', 1);
					let file = `./${eleParts[0]}/${eleParts[1]}`;
					if (!await fu.exists(file)) {
						if (tmpItem[0] == 'lsha1' && tmpItem[1] == 'rsha1') {
							continue; // doesn't exists in work directory, local or in remote
							// should do fetch, but not sure if message should be shown
						}
						console.error(`Changes detected in working directory, commit removal of file: '${file}'`);
						saveChanges = true;
					}
					let lsha1 = '';
					try {
						lsha1 = await hash.getFileHash(file);
					} catch (err) {
						// error while reading file, so don't push it.
						continue;
					}
					if (lsha1 == tmpItem[0] || tmpItem[0] == 'lsha1') {
						files.push(file);
						dirs.push(`./${eleParts[0]}`);
					} else {
						console.error(`Changes detected in working directory, save file: '${file}'`);
						saveChanges = true;
					}
				}
				if (!saveChanges) {
					// remove files
					for (let file of files) {
						try {
							await fu.unlink(file);
						} catch (err) {
							console.error(`Error detected while removing file '${file}' from working directory.`);
						}
					}
					// remove directories
					for (let dir of dirs) {
						try {
							await fu.rmdir(dir);
						} catch (err) {
							// don't care (keep if there is anything left in that directory)
						}
					}
				} else {
					console.error("You have to save or discard your changes before checkout other stage.");
					process.exit(1);
				}
			} catch (err) {
				// don't care if there is nothing fetched (index file don't exists)
			}
		}

		let localStageDir = `${fu.edoDir}/${fu.mapDir}/${stage}`;
		if (await fu.exists(localStageDir)) {
			let eleList: { [key: string]: string } = {};
			try {
				eleList = await fu.getEleListFromStage(stage);
			} catch (err) {
				// file doesn't exists or read error, skip updating working tree
				console.log("There is no index for this stage, run 'edo fetch' and 'edo pull'");
				await fu.writefile(`${fu.edoDir}/${fu.stageFile}`, Buffer.from(stage));
				console.log("checkout map stage: " + stage); // update stage (so the checkout is done)
				process.exit(0);
			}

			let lines = Object.values(eleList);
			let noFiles: string[] = [];
			let errFiles: string[] = [];
			for (let item of lines) {
				let tmpItem = fu.splitX(item, ',', 4);  // lsha1,rsha1,fingerprint,fileExt,typeName-fullElmName
				let eleParts = fu.splitX(tmpItem[4], '-', 1);
				let file = `./${eleParts[0]}/${eleParts[1]}`;
				try {
					if (tmpItem[0] != 'lsha1') { // get latest local version (if exists)
						await fu.copyFile(`${localStageDir}/${fu.remote}/${tmpItem[0]}`, file);
					} else if (tmpItem[1] != 'rsha1') { // if not, get remote version (if exists)
						await fu.copyFile(`${localStageDir}/${fu.remote}/${tmpItem[1]}`, file);
					} else { // if doesn't exists, save for final message
						noFiles.push(file);
					}
				} catch (err) { // error during copy file
					errFiles.push(`Error for file '${file}': ${err}`);
				}
			}

			if (noFiles.length > 0) {
				console.log("Following files are missing, run 'edo fetch' and 'edo pull' to update stage:");
				console.log(noFiles.join(', '));
			}
			if (errFiles.length > 0) {
				console.error("There were following errors when updating working directory:");
				console.error(errFiles.join("\n"));
			}
		} else {
			await fu.mkdir(`${fu.edoDir}/${fu.mapDir}/${stage}`);
		}
		await fu.writefile(`${fu.edoDir}/${fu.stageFile}`, Buffer.from(stage));
		console.log("checkout map stage: " + stage);
	}

}
