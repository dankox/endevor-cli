import yargs from 'yargs';
import { FileUtils } from '../api/utils/FileUtils';
import { ISettings } from '../api/doc/ISettings';
import { isNullOrUndefined } from 'util';
import { EdoPushApi } from '../api/EdoPushApi';
import { CsvUtils } from '../api/utils/CsvUtils';

/**
 * Edo pull, meaning do fetch and merge together
 */
export class EdoPush {
	private static readonly edoPushFile : yargs.PositionalOptions = {
		describe: 'Name of file `type/element` to push to remote repo in Endevor',
		type: "string"
	};

	private static readonly edoPushMessage : yargs.Options = {
		describe: 'Message will be parsed as ccid and comment and used in Endevor (parsing is by space)',
		demand: true,
		alias: "m",
		type: "string"
	};

	public static edoPushOptions = {
		files: EdoPush.edoPushFile,
		message: EdoPush.edoPushMessage
	};


	/**
	 * push
	 */
	public static async process(argv: any) {
		const config: ISettings = await FileUtils.readSettings();
		const stage: string = await FileUtils.readStage();
		const files: string[] = (isNullOrUndefined(argv.files) ? [] : argv.files);
		const msgA: string[] = CsvUtils.splitX(argv.message, ' ', 1);
		const ccid: string = msgA[0].substr(0, 12); // ccid length 12
		const comment: string = msgA[1].substr(0, 40); // comment length 40


		try {
			await EdoPushApi.push(config, stage, ccid, comment, files);
		} catch (err) {
			console.error("Error while running push!");
			console.error(err.message);
			process.exit(1);
		}
	}

}
