import yargs from "yargs";
import { FileUtils } from "../api/utils/FileUtils";
import { ISettings } from "../api/doc/ISettings";
import { CsvUtils } from "../api/utils/CsvUtils";
import { EdoFetchApi } from "../api/EdoFetchApi";
import { EdoCache } from "../api/EdoCache";
import { HashUtils } from "../api/utils/HashUtils";
import { isNullOrUndefined } from "util";
import { ConsoleUtils } from "../api/utils/ConsoleUtils";

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

	private static readonly edoFetchLogsOption : yargs.Options = {
		describe: 'Fetch logs/history for elements',
		demand: false,
		boolean: true,
		alias: 'l'
	};

	private static readonly edoFetchStage : yargs.PositionalOptions = {
		describe: 'Name or sha1 id of remote stage which you want to fetch',
		type: "string"
	};

	private static readonly edoFetchFile : yargs.PositionalOptions = {
		describe: 'Name of file to fetch from remote Endevor. Format of files `typeName/eleName`',
		type: "string"
	};

	public static edoFetchOptions(argv: typeof yargs) {
		return argv
			.option('all', EdoFetch.edoFetchAllOption)
			.option('logs', EdoFetch.edoFetchLogsOption)
			.positional('stage', EdoFetch.edoFetchStage)
			.positional('files', EdoFetch.edoFetchFile);
	}


	/**
	 *
	 * @param argv
	 */
	public static async process(argv: any) {
		let config: ISettings = await FileUtils.readSettings();
		// verify credentials before running all the requests
		try {
			const creds = CsvUtils.splitX(Buffer.from(config.cred64, "base64").toString(), ':', 1);
			const cred64 = await ConsoleUtils.verifyCredentials(config.repoURL, creds[0], creds[1]);
			if (config.cred64 != cred64) {
				config.cred64 = cred64;
				await FileUtils.writeSettings(config);
			}
		} catch (err) {
			console.error("Error while verifying credentials.\n" + err.message);
			process.exit(1);
		}

		// find out if stage argument is stage or file
		if (argv.stage) {
			if (!HashUtils.isSha1(argv.stage)) {
				if (!argv.stage.startsWith('.map') && !argv.stage.match(/.+-.+-.+-.+/)) {
					if (!argv.files || argv.files.legnth == 0) {
						argv.files = [ argv.stage ];
					} else {
						argv.files.unshift(argv.stage);
					}
					delete argv.stage;
				}
			}
		}

		// pick stage if specified, or load
		let stage = argv.stage || await FileUtils.readStage();
		let files: string[] = argv['files'] ? argv['files'] : [];
		const all = !isNullOrUndefined(argv.all) ? argv.all : false;
		const logs = !isNullOrUndefined(argv.logs) ? argv.logs : false;
		const type =  logs ? EdoCache.OBJ_LOGS : EdoCache.OBJ_BLOB;

		try {
			// for option to fetch for all stages in map
			if (all) {
				// get map array containing all stages to fetch from
				let stageArr = await CsvUtils.getMapArray(stage);
				let index = await EdoFetchApi.fetchRemote(config, stage, argv.files, type);
				let localFiles = files.length == 0 ? EdoCache.getFiles(index) : files;
				stageArr.shift(); // remove first stage (we've got it ^)
				for (const stg of stageArr) {
					await EdoFetchApi.fetchRemote(config, stg, localFiles, type);
				}
			} else if (files.length > 0) {
				// run fetch for specific files with search (if file specified, we might want to grab it from map)
				await EdoFetchApi.fetchRemote(config, stage, files, type, true);
			} else {
				// run fetch for one stage only
				await EdoFetchApi.fetchRemote(config, stage, [], type);
			}
		} catch (err) {
			console.error("\nError while running fetch!");
			console.error(err.message);
			process.exit(1);
		}
	}
}
