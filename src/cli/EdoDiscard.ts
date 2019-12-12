import yargs from "yargs";
import { FileUtils as fu, FileUtils } from "../api/utils/FileUtils";
import { EdoCheckoutApi } from "../api/EdoCheckoutApi";
import { isNullOrUndefined } from "util";
import { EdoCache } from "../api/EdoCache";
import { HashUtils } from "../api/utils/HashUtils";

/**
 * Endevor checkout stage (on local)
 */
export class EdoDiscard {
	private static readonly edoDiscardFile : yargs.PositionalOptions = {
		describe: 'File to discard (type/element)'
	};

	public static edoDiscardOptions = {
		files: EdoDiscard.edoDiscardFile
	};


	/**
	 *
	 * @param argv
	 */
	public static async process(argv: any) {
		let files: string[] = [];
		if (!isNullOrUndefined(argv.files)) files = argv.files;
		let stage = await FileUtils.readStage();
		if (!HashUtils.isSha1(stage)) {
			console.log("There is no index for this stage, run 'edo fetch' and 'edo merge', or just run 'edo pull'");
			process.exit(0);
		}

		let index = await EdoCache.readIndex(stage);

		try {
			await EdoCheckoutApi.checkoutFiles(index, files);
		} catch (err) {
			console.error("Error while running discard!");
			console.error(err.message);
			process.exit(1);
		}
	}

}
