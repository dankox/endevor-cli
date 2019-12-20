import yargs from 'yargs';
import { FileUtils } from '../api/utils/FileUtils';
import { ISettings } from '../api/doc/ISettings';
import { isNullOrUndefined } from 'util';
import { EdoPushApi } from '../api/EdoPushApi';
import { CsvUtils } from '../api/utils/CsvUtils';
import { ConsoleUtils } from '../api/utils/ConsoleUtils';

/**
 * Edo pull, meaning do fetch and merge together
 */
export class EdoPush {
	private static readonly edoPushFile : yargs.PositionalOptions = {
		describe: 'Name of file `type/element` to push to remote repo in Endevor',
		type: "string"
	};

	private static readonly edoPushMessage : yargs.Options = {
		describe: 'Message will be parsed as ccid and comment and used in Endevor (parsing is done by space)',
		demand: true,
		alias: "m",
		type: "string"
	};

	public static edoPushOptions(argv: typeof yargs) {
		return argv
			.option('message', EdoPush.edoPushMessage)
			.positional('files', EdoPush.edoPushFile);
	}


	/**
	 * push
	 */
	public static async process(argv: any) {
		const config: ISettings = await FileUtils.readSettings();
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
