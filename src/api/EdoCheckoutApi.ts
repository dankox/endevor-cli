import { FileUtils } from "./utils/FileUtils";
import { HashUtils } from "./utils/HashUtils";
import { isNullOrUndefined } from "util";
import { EdoCache } from "./EdoCache";
import { IEdoIndex } from "./doc/IEdoIndex";
import { CsvUtils } from "./utils/CsvUtils";

/**
 * Endevor checkout stage (on local)
 */
export class EdoCheckoutApi {

	/**
	 * Checkout stage in edo.
	 *
	 * @param stage id specified in form 'env-stgnum-sys-sub'
	 */
	public static async checkout(stage: string) {
		// verify if valid stage
		let subMap: {[key: string]: string} = await CsvUtils.getDataFromCSV(FileUtils.subMapFile);
		if (isNullOrUndefined(subMap[stage])) {
			throw new Error(`Stage '${stage}' is not found! Verify if you wrote it correctly.`);
		}

		// check if currently checked out stage (and remove from work dir)
		if (await FileUtils.exists(`${FileUtils.getEdoDir()}/${FileUtils.stageFile}`)) {
			let currentIndex = await FileUtils.readStage();
			// do only if indexSha1 is actually SHA1... for name, skip because it doesn't have index
			if (await EdoCache.sha1Exists(currentIndex)) {
				// get if exists...
				let eleList: IEdoIndex = await EdoCache.readIndex(currentIndex);
				let lines = Object.values(eleList.elem);
				let dirs: string[] = [];
				let files: string[] = [];
				let saveChanges: boolean = false;

				// walk thru elements and check if can be removed
				for (let tmpItem of lines) {
					const eleParts = CsvUtils.splitX(tmpItem[4], FileUtils.separator, 1);
					let file = `${FileUtils.cwdEdo}${tmpItem[4]}`; // update for doing checkout inside dirs
					if (!await FileUtils.exists(file)) {
						if (tmpItem[0] == 'lsha1' && tmpItem[1] == 'rsha1') {
							continue; // doesn't exists in work directory, local or in remote
							// should do fetch, but not sure if message should be shown
						}
						console.error(`Changes detected in working directory, commit removal of file: '${file}'`);
						saveChanges = true;
					}
					let lsha1 = '';
					try {
						lsha1 = await HashUtils.getEdoFileHash(FileUtils.cwdEdo + file);
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
							await FileUtils.unlink(file);
						} catch (err) {
							console.error(`Error detected while removing file '${file}' from working directory.`);
						}
					}
					// remove directories
					for (let dir of dirs) {
						try {
							await FileUtils.rmdir(dir);
						} catch (err) {
							// don't care (keep if there is anything left in that directory)
						}
					}
				} else {
					throw new Error("You have to save or discard your changes before checkout other stage.");
				}
			}
			// don't care if index file doesn't exist... there is nothing fetched
		}

		let indexSha1 = await FileUtils.readRefs(stage);
		if (indexSha1 != null) {
			let indexList: IEdoIndex;
			try {
				indexList = await EdoCache.readIndex(indexSha1);
			} catch (err) {
				// file doesn't exists or read error, skip updating working tree
				// console.log("There is no index for this stage, run 'edo fetch' and 'edo pull'");
				// await FileUtils.writefile(`${FileUtils.getEdoDir()}/${FileUtils.stageFile}`, Buffer.from(stage));
				// console.log("checkout map stage: " + stage); // update stage (so the checkout is done)
				// process.exit(0);
				console.log("index error: " + err);
				throw new Error("error occur during reading index...");
			}

			await EdoCheckoutApi.checkoutFiles(indexList);

		} else {
			// await FileUtils.mkdir(`${FileUtils.getEdoDir()}/${FileUtils.mapDir}/${stage}`);
			// TODO: index doesn't exists, create by fetch???
			// file doesn't exists or read error, skip updating working tree
			console.log("There is no index for this stage, run 'edo fetch' and 'edo merge', or just run 'edo pull'");
			// await FileUtils.writefile(`${FileUtils.getEdoDir()}/${FileUtils.stageFile}`, Buffer.from(stage));
			// console.log("checkout map stage: " + stage); // update stage (so the checkout is done)
			// process.exit(0);
		}
		await FileUtils.writeFile(`${FileUtils.getEdoDir()}/${FileUtils.stageFile}`, Buffer.from(stage));
		console.log("checkout map stage: " + stage);
	}

	/**
	 * Checkout files. Overwrite working directory with files from index.
	 *
	 * If files specified, checkout is limited to these files.
	 *
	 * @param index IEdoIndex with files to checkout
	 * @param files list of files (in format `typeName/eleName`) to limit checkout
	 */
	public static async checkoutFiles(index: IEdoIndex, files: string[] = []) {
		let lines = Object.values(index.elem);

		for (const item of lines) {
			// if files specified and current file is not in files, skip
			if (files.length > 0 && files.indexOf(item[4]) == -1) continue;

			const file = CsvUtils.getFilePath(item);
			try {
				const buf = await EdoCache.getSha1Object(item[0], EdoCache.OBJ_BLOB);
				await FileUtils.writeFile(file, buf);
			} catch (err) {
				console.error(`Error while checking out local version of '${file}'! ` + err.message);
			}
		}
	}

}
