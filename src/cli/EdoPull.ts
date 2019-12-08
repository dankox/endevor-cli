import yargs from 'yargs';
import { isNullOrUndefined } from 'util';
import { FileUtils } from '../api/utils/FileUtils';
import { EdoPullApi } from '../api/EdoPullApi';
import { EdoCache } from '../api/EdoCache';
import { ISettings } from '../api/doc/ISettings';

/**
 * Endevor pull sources from remote location
 */
export class EdoPull {
	private static readonly edoPullFile : yargs.PositionalOptions = {
		describe: 'Name of file (element.type) to pull from remote Endevor',
		type: "string"
	};

	public static edoPullOptions = {
		files: EdoPull.edoPullFile
	};


	/**
	 * pull
	 */
	public static async pull(argv: any) {
		let config: ISettings = await FileUtils.readSettings();
		let stage: string = await FileUtils.readStage();
		let files: string[] = [];
		let search: boolean = false;

		if (isNullOrUndefined(argv.files) || argv.files.length == 0) {
			files = EdoCache.getFiles(await EdoCache.readIndex(stage), 'fingerprint=null');
		} else {
			for (let file of argv.files) {
				if (await FileUtils.exists(file)) {
					// get the final full file name in proper format
					if (file.startsWith(".ele/")) {
						let fn: string[] = file.split('/');
						file = fn[1].split('.').reverse().join(FileUtils.separator);
					} else if (file.startsWith(".ele\\")) {
						let fn = file.split('\\');
						file = fn[1].split('.').reverse().join(FileUtils.separator);
					} else {
						let fn = (file.indexOf('/') > 0 ? file.split('/') : file.split('\\'));
						file = `${fn[0]}${FileUtils.separator}${fn[1]}`;
					}
					files.push(file);
					search = true;
				} else {
					console.error(`Don't know file '${file}'!`);
				}
			}
		}

		try {
			await EdoPullApi.pull(config, stage, files, EdoCache.OBJ_BLOB, search);
		} catch (err) {
			console.error("Error while running pull!");
			console.error(err);
			process.exit(1);
		}
	}

}
