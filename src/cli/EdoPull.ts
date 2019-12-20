import yargs from 'yargs';
import { FileUtils } from '../api/utils/FileUtils';
import { EdoCache } from '../api/EdoCache';
import { ISettings } from '../api/doc/ISettings';
import { EdoFetchApi } from '../api/EdoFetchApi';
import { EdoMergeApi } from '../api/EdoMergeApi';
import { isNullOrUndefined } from 'util';
import { HashUtils } from '../api/utils/HashUtils';
import { CsvUtils } from '../api/utils/CsvUtils';
import { ConsoleUtils } from '../api/utils/ConsoleUtils';

/**
 * Edo pull, meaning do fetch and merge together
 */
export class EdoPull {
	private static readonly edoPullFile : yargs.PositionalOptions = {
		describe: 'Name of files (element.type) to pull from remote repo',
		type: "string"
	};

	private static readonly edoPullStage : yargs.PositionalOptions = {
		describe: 'Name of stage to pull elements from',
		type: "string"
	};


	public static edoPullOptions(argv: typeof yargs) {
		return argv
			.positional('stage', EdoPull.edoPullStage)
			.positional('files', EdoPull.edoPullFile);
	}


	/**
	 * pull
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
		let files: string[] = (isNullOrUndefined(argv.files) ? [] : argv.files);

		try {
			if (files.length > 0) {
				// run fetch for specific files with search (if file specified, we might want to grab it from map)
				await EdoFetchApi.fetchRemote(config, stage, argv.files, EdoCache.OBJ_BLOB, true, false);
			} else {
				// run fetch for one stage only
				await EdoFetchApi.fetchRemote(config, stage, [], EdoCache.OBJ_BLOB, false, false);
			}
			await EdoMergeApi.merge(stage, undefined, files);
		} catch (err) {
			console.error("Error while running pull!");
			console.error(err.message);
			process.exit(1);
		}
	}

}
