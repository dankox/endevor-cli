import yargs from "yargs";
import { FileUtils } from "../api/utils/FileUtils";
import { ISettings } from "../api/doc/ISettings";
import { CsvUtils } from "../api/utils/CsvUtils";
import { EdoFetchApi } from "../api/EdoFetchApi";

/**
 * Endevor fetch remote stage to local
 */
export class EdoFetch {
	public static readonly listele: string = "env/*/stgnum/*/sys/*/subsys/*/type/*/ele";

	private static readonly edoFetchAllOption : yargs.Options = {
		describe: 'Fetch all elements from the map',
		demand: false,
		boolean: true,
		alias: 'a'
	};

	public static edoFetchOptions = {
		all: EdoFetch.edoFetchAllOption
	};


	/**
	 *
	 * @param argv
	 */
	public static async process(argv: any) {
		let config: ISettings = await FileUtils.readSettings();
		let stage = await FileUtils.readStage();

		// for option to fetch for all stages in map
		if (argv.all) {
			// get map array containing all stages to fetch from
			let stageArr = await CsvUtils.getMapArray(stage);
			// remove .ele helper (will be populated by fetch stage function)
			await FileUtils.rmrf(".ele");
			// run fetch for all stages from map
			await Promise.all(stageArr.map(item => EdoFetchApi.fetchStage(config, item)));

		} else {
			// run fetch for one stage only
			await EdoFetchApi.fetchStage(config, stage);
		}
	}
}
