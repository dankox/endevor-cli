import yargs from 'yargs';
import { EdoInitApi } from "../api/EdoInitApi";
import { EndevorRestApi } from '../api/utils/EndevorRestApi';
import { ConsoleUtils } from '../api/utils/ConsoleUtils';
import { isNullOrUndefined } from 'util';

/**
 * Endevor initialize local repo from remote URL
 *
 * @export
 * @class NdvInit
 */
export class EdoInit {

	private static readonly edoInitUrlOptions : yargs.PositionalOptions = {
		describe: 'Full remote URL of Endevor repo (e.g. http://localhost:8080/EndevorService/rest/CONFIG)'
	};

	private static readonly edoInitUserOptions : yargs.Options = {
		describe: 'Username',
		demand: false,
		alias: 'u'
	};

	private static readonly edoInitPassOptions : yargs.Options = {
		describe: 'Password',
		demand: false,
		alias: 'p'
	};

	public static edoInitOptions = {
		url: EdoInit.edoInitUrlOptions,
		user: EdoInit.edoInitUserOptions,
		pass: EdoInit.edoInitPassOptions
	};

	/**
	 *
	 * @param argv
	 */
	public static async process(argv: any) {
		console.log("initializing local repo");

		// check if it is already a repo
		// if (await fu.isNdvDir()) {
		// 	console.error("Current directory is already initialized repo!");
		// 	process.exit(1);
		// }

		let repoURL = argv.url;
		let user = argv.user;
		let password = argv.pass;
		// validate URL
		if (isNullOrUndefined(repoURL)) {
			console.error("Repo URL is not specified!");
			process.exit(1);
		}
		if (repoURL.slice(-1) !== "/"){
			repoURL = repoURL + "/";
		}

		// verify instance (if exists)
		console.log(`verifying url (${repoURL})...`);
		let response = await EndevorRestApi.getHttp(repoURL.slice(0, -1)); // with slash at the end it needs authorization header
		if (response.status != 200) {
			console.error(`Instance ${argv.instance} doesn't exists`);
			process.exit(1);
		}

		// TODO: this part needs to be done outside in CLI (for each http function: init, fetch, pull, push)
		// currently done in initApi, because we need to verify instance first
		// verify credentials
		console.log(`verifying credentials...`);
		let cred64: string = '';
		try {
			cred64 = await ConsoleUtils.verifyCredentials(repoURL, user, password);
		} catch (err) {
			console.error("Error while verifying credentials.\n" + err.message);
			process.exit(1);
		}

		try {
			await EdoInitApi.init(repoURL, cred64);
		} catch (err) {
			console.error("Error while running init!");
			console.error(err.message);
			process.exit(1);
		}
	}
}


// Test
// EdoInit.process({url: "http://ca31.ca.com:9009/EndevorService/rest/ENWSTSTC"});
