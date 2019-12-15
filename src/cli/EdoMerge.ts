import yargs from 'yargs';
import { isNullOrUndefined } from 'util';
import { FileUtils } from '../api/utils/FileUtils';
import { EdoMergeApi } from '../api/EdoMergeApi';
import { HashUtils } from '../api/utils/HashUtils';

/**
 * Edo merge remote stage to local stage
 */
export class EdoMerge {
	private static readonly edoMergeFile : yargs.PositionalOptions = {
		describe: 'Name of file|files (type/element) to merge',
		type: "string"
	};

	private static readonly edoMergeStage : yargs.PositionalOptions = {
		describe: 'Name or sha1 id of stage which should be merge to working directory',
		type: "string"
	};

	public static edoMergeOptions(argv: typeof yargs) {
		return argv
			.positional('stage', EdoMerge.edoMergeStage)
			.positional('files', EdoMerge.edoMergeFile);
	}


	/**
	 * merge
	 */
	public static async process(argv: any) {
		try {
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

			let stage: string = await FileUtils.readStage();
			let remoteStage: string = argv.stage; // if undefined, merge will pick remote for this local stage

			let files: string[] = (isNullOrUndefined(argv.files) ? [] : argv.files);

			await EdoMergeApi.merge(stage, remoteStage, files);
		} catch (err) {
			console.error("Error while running merge!");
			console.error(err.message);
			process.exit(1);
		}
	}

}
