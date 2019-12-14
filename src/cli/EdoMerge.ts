import yargs from 'yargs';
import { isNullOrUndefined } from 'util';
import { FileUtils } from '../api/utils/FileUtils';
import { EdoMergeApi } from '../api/EdoMergeApi';

/**
 * Edo merge remote stage to local stage
 */
export class EdoMerge {
	private static readonly edoMergeFile : yargs.PositionalOptions = {
		describe: 'Name of file|files (type/element) to merge',
		type: "string"
	};

	private static readonly edoMergeStage : yargs.PositionalOptions = {
		describe: 'Name or sha1 id of stage to merge with',
		type: "string"
	};

	public static edoMergeOptions = {
		stage: EdoMerge.edoMergeStage
		// files: EdoMerge.edoMergeFile
	};


	/**
	 * merge
	 */
	public static async process(argv: any) {
		try {
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
