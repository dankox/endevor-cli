import yargs from 'yargs';
import { isNullOrUndefined } from 'util';
import { FileUtils } from '../api/utils/FileUtils';
import { EdoMergeApi } from '../api/EdoMergeApi';
import { EdoCache } from '../api/EdoCache';
import { ISettings } from '../api/doc/ISettings';

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
		let stage: string = await FileUtils.readStage();
		let remoteStage: string = argv.stage; // if undefined, merge will pick remote for this local stage

		let files: string[] = [];
		// TODO: figure out way to pass files (coz stage is also positional!!!)
		// if (isNullOrUndefined(argv.files) || argv.files.length == 0) {
		// 	files = EdoCache.getFiles(await EdoCache.readIndex(stage), 'fingerprint=null');
		// } else {
		// 	for (let file of argv.files) {
		// 		if (await FileUtils.exists(file)) {
		// 			// get the final full file name in proper format
		// 			if (file.startsWith(".ele/")) {
		// 				let fn: string[] = file.split('/');
		// 				file = fn[1].split('.').reverse().join(FileUtils.separator);
		// 			} else if (file.startsWith(".ele\\")) {
		// 				let fn = file.split('\\');
		// 				file = fn[1].split('.').reverse().join(FileUtils.separator);
		// 			} else {
		// 				let fn = (file.indexOf('/') > 0 ? file.split('/') : file.split('\\'));
		// 				file = `${fn[0]}${FileUtils.separator}${fn[1]}`;
		// 			}
		// 			files.push(file);
		// 		} else {
		// 			console.error(`Don't know file '${file}'!`);
		// 		}
		// 	}
		// }

		try {
			await EdoMergeApi.merge(stage, remoteStage);
		} catch (err) {
			console.error("Error while running merge!");
			console.error(err.message);
			process.exit(1);
		}
	}

}
