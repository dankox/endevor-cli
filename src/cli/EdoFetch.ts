import yargs from "yargs";
import { FileUtils } from "../api/utils/FileUtils";
import { ISettings } from "../api/doc/ISettings";
import { CsvUtils } from "../api/utils/CsvUtils";
import { EdoFetchApi } from "../api/EdoFetchApi";

/**
 * Endevor fetch remote stage to local
 */
export class EdoFetch {
	private static readonly edoFetchAllOption : yargs.Options = {
		describe: 'Fetch all elements from the map',
		demand: false,
		boolean: true,
		alias: 'a'
	};

	private static readonly edoFetchFile : yargs.PositionalOptions = {
		describe: 'Name of file (element.type) to fetch from remote Endevor',
		type: "string"
	};

	public static edoFetchOptions = {
		all: EdoFetch.edoFetchAllOption,
		files: EdoFetch.edoFetchFile
	};


	/**
	 *
	 * @param argv
	 */
	public static async process(argv: any) {
		let config: ISettings = await FileUtils.readSettings();
		let stage = await FileUtils.readStage();

		try {
			// for option to fetch for all stages in map
			if (argv.all) {
				// get map array containing all stages to fetch from
				let stageArr = await CsvUtils.getMapArray(stage);
				// remove .ele helper (will be populated by fetch stage function)
				await FileUtils.rmrf(".ele");
				// run fetch for all stages from map
				await Promise.all(stageArr.map(item => EdoFetchApi.fetchRemote(config, item)));

			} else if (argv.files) {
				// run fetch for specific files
				await EdoFetchApi.fetchRemote(config, stage, argv.files);
			} else {
				// run fetch for one stage only
				await EdoFetchApi.fetchRemote(config, stage);
			}
		} catch (err) {
			console.error("Error while running fetch!");
			console.error(err);
			process.exit(1);
		}
	}
}
