import yargs from "yargs";
import { FileUtils as fu, FileUtils } from "../api/utils/FileUtils";
import { EdoCheckoutApi } from "../api/EdoCheckoutApi";
import { isNullOrUndefined } from "util";
import { EdoCache } from "../api/EdoCache";
import { HashUtils } from "../api/utils/HashUtils";

/**
 * Endevor checkout stage (on local)
 */
export class EdoReset {
	private static readonly edoResetFile : yargs.PositionalOptions = {
		describe: 'File to reset (type/element)'
	};

	public static edoResetOptions(argv: typeof yargs) {
		return argv
			.positional('files', EdoReset.edoResetFile);
	}


	/**
	 *
	 * @param argv
	 */
	public static async process(argv: any) {
		let files: string[] = [];
		if (!isNullOrUndefined(argv.files)) files = argv.files;
		let stage = await FileUtils.readStage(true);

		let lindex = await EdoCache.readIndex(stage);
		let rindex = await EdoCache.readIndex(`remote/${stage}`);

		try {
			let updateIndex: boolean = false;
			let allFiles: string[] = [...new Set([...Object.keys(lindex.elem), ...Object.keys(rindex.elem)])];

			for (const file of allFiles) {
				if (files.length > 0 && files.indexOf(file) == -1) continue;

				// if it's in local
				if (lindex.elem[file]) {
					if (rindex.elem[file]) {
						lindex.elem[file] = rindex.elem[file];
					} else {
						delete lindex.elem[file];
					}

					// not in local (in remote only)
				} else {
					lindex.elem[file] = rindex.elem[file];
				}
				updateIndex = true;
			}

			if (updateIndex) {
				const indexSha1 = await EdoCache.writeIndex(lindex);
				if (indexSha1 != null) {
					FileUtils.writeRefs(stage, indexSha1); // update refs
					try {
						await FileUtils.unlink(`${FileUtils.getEdoDir()}/${FileUtils.mergeFile}`);
						await FileUtils.unlink(`${FileUtils.getEdoDir()}/${FileUtils.mergeConflictFile}`);
					} catch (err) {
						// Don't care, unlink might fail for mergeConflictFile if there were no conflicts
					}
					console.log(`reset of ${stage} done...`);
					return;
				}
			}
			console.log("nothing to reset...");

			// TODO: do logs to show what was discarded
			// await EdoCheckoutApi.checkoutFiles(index, files);
		} catch (err) {
			console.error("Error while running discard!");
			console.error(err.message);
			process.exit(1);
		}
	}

}
