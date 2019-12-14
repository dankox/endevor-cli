import yargs from 'yargs';
import { FileUtils } from '../api/utils/FileUtils';
import { EdoCache } from '../api/EdoCache';
import { ISettings } from '../api/doc/ISettings';
import { EdoFetchApi } from '../api/EdoFetchApi';
import { EdoMergeApi } from '../api/EdoMergeApi';
import { isNullOrUndefined } from 'util';

/**
 * Edo pull, meaning do fetch and merge together
 */
export class EdoPull {
	private static readonly edoPullFile : yargs.Options = {
		describe: 'Name of files (element.type) to pull from remote repo',
		alias: "f",
		type: "string"
	};

	private static readonly edoPullStage : yargs.PositionalOptions = {
		describe: 'Name of stage to pull elements from',
		type: "string"
	};

	public static edoPullOptions = {
		files: EdoPull.edoPullFile,
		stage: EdoPull.edoPullStage
	};


	/**
	 * pull
	 */
	public static async process(argv: any) {
		let config: ISettings = await FileUtils.readSettings();
		let stage: string = await FileUtils.readStage();
		let remoteStage: string = argv.stage; // if undefined, merge will pick remote for this local stage
		let files: string[] = (isNullOrUndefined(argv.files) ? [] : argv.files);

		try {
			if (files.length > 0) {
				// run fetch for specific files with search (if file specified, we might want to grab it from map)
				await EdoFetchApi.fetchRemote(config, stage, argv.files, EdoCache.OBJ_BLOB, true, false);
			} else {
				// run fetch for one stage only
				await EdoFetchApi.fetchRemote(config, stage, [], EdoCache.OBJ_BLOB, false, false);
			}
			await EdoMergeApi.merge(stage, remoteStage, files);
		} catch (err) {
			console.error("Error while running pull!");
			console.error(err.message);
			process.exit(1);
		}
	}

}
