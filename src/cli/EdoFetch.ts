import yargs from "yargs";
import { FileUtils } from "../api/utils/FileUtils";
import { ISettings } from "../api/doc/ISettings";
import { CsvUtils } from "../api/utils/CsvUtils";
import { EdoFetchApi } from "../api/EdoFetchApi";
import { EdoCache } from "../api/EdoCache";

/**
 * Edo fetch remote stage to local
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
				let index = await EdoFetchApi.fetchRemote(config, stage);
				let files = EdoCache.getFiles(index);
				stageArr.shift(); // remove first stage (we've got it ^)
				for (const stg of stageArr) {
					await EdoFetchApi.fetchRemote(config, stg, files);
				}
			} else if (argv.files) {
				// run fetch for specific files with search (if file specified, we might want to grab it from map)
				await EdoFetchApi.fetchRemote(config, stage, argv.files, EdoCache.OBJ_BLOB, true);
			} else {
				// run fetch for one stage only
				await EdoFetchApi.fetchRemote(config, stage);
			}
		} catch (err) {
			console.error("\nError while running fetch!");
			console.error(err.message);
			process.exit(1);
		}
	}
}
