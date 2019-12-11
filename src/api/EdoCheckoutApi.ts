import { FileUtils } from "./utils/FileUtils";
import { isNullOrUndefined } from "util";
import { EdoCache } from "./EdoCache";
import { IEdoIndex } from "./doc/IEdoIndex";
import { CsvUtils } from "./utils/CsvUtils";
import { EdoDiffApi } from "./EdoDiffApi";
import * as path from "path";

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
			let stageSha1 = await FileUtils.readStage();
			// do only if indexSha1 is actually SHA1... for name, skip because it doesn't have index
			if (await EdoCache.sha1Exists(stageSha1)) {
				const index = await EdoCache.readIndex(stageSha1);
				const changes = await EdoDiffApi.getFileDiff(index.stgn);
				// TODO: later update to not delete everything if stages share some files...
				// const stgChanges = await EdoDiffApi.getFileDiff(stage, index.stgn);
				const difFiles = Object.keys(changes);
				const wdFiles = EdoCache.getFiles(index);
				let errMsg: string = '';
				if (difFiles.length > 0) {
					errMsg += `Changes detected in following files:\n`;
					errMsg += `  (use 'edo restore [files]...' to discard changes in working directory)\n`;
					errMsg += `  (use 'edo commit -a' or 'edo commit <files>...' to commit changes)\n`;
					errMsg += `   \x1b[31m${difFiles.join(', ')}\x1b[0m\n`;
					throw new Error("You have to save or discard your changes before checkout other stage!\n" + errMsg);
				}
				// remove files
				let dirs = new Set<string>();
				for (let file of wdFiles) {
					try {
						await FileUtils.unlink(FileUtils.cwdEdo + file);
						dirs.add(path.dirname(file));
					} catch (err) {
						console.error(`Error detected while removing file '${file}' from working directory.`);
					}
				}
				// remove directories
				for (let dir of dirs) {
					try {
						await FileUtils.rmdir(FileUtils.cwdEdo + dir);
					} catch (err) {
						// don't care (keep if there is anything left in that directory)
						console.error("Test... if there is error " + err);
					}
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
				console.error("index error: " + err.message);
				throw new Error("error occur during reading index...");
			}

			await EdoCheckoutApi.checkoutFiles(indexList);

		} else {
			// TODO: merge automatically remote if exists???
			// file doesn't exists or read error, skip updating working tree
			console.log("There is no index for this stage, run 'edo fetch' and 'edo merge', or just run 'edo pull'");
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
