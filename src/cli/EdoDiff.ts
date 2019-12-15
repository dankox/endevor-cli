import yargs from "yargs";
import { FileUtils } from "../api/utils/FileUtils";
import { isNullOrUndefined } from "util";
import { EdoDiffApi } from "../api/EdoDiffApi";
import { EdoCache } from "../api/EdoCache";
import { HashUtils } from "../api/utils/HashUtils";

/**
 * Edo diff files in working directory with checked out stage
 */
export class EdoDiff {
	private static readonly edoDiffFiles : yargs.PositionalOptions = {
		describe: 'File names which you want to diff with local/remote stage'
	};

	private static readonly edoDiffCached : yargs.Options = {
		// describe: 'Diff changes in local stage. Get the last version in local stage and diff it with base in local stage.',
		describe: 'Diff cached changes with remote. Cached changes are all commited changes on local stage.',
		demand: false,
		boolean: true,
		conflicts: "remote",
		alias: 'c'
	};

	private static readonly edoDiffRemote : yargs.Options = {
		describe: 'Diff commited changes with remote changes (local stage with remote stage).',
		demand: false,
		boolean: true,
		conflicts: "cached",
		alias: 'r'
	};

	private static readonly edoDiffRemoteBase : yargs.Options = {
		describe: 'Diff commited changes with remote base changes (local stage with base version on remote stage).',
		demand: false,
		boolean: true,
		conflicts: "cached",
		alias: 'b'
	};

	public static edoDiffOptions(argv: typeof yargs) {
		return argv
			.option('cached', EdoDiff.edoDiffCached)
			// .option('remote', EdoDiff.edoDiffRemote)
			.option('base', EdoDiff.edoDiffRemoteBase)
			.positional('files', EdoDiff.edoDiffFiles);
	}


	/**
	 *
	 * @param argv
	 */
	public static async process(argv: any) {
		let stage: string = await FileUtils.readStage(true);

		// cached, it's always commited changes against remote version
		let cached: boolean = !isNullOrUndefined(argv.cached) ? argv.cached : false;
		// remote, workdir file against remote version
		// let remote: boolean = !isNullOrUndefined(argv.remote) ? argv.remote : false;
		let rBase: boolean = !isNullOrUndefined(argv.base) ? argv.base : false;

		// get changes in the working directory against local stage
		let changes: {[key: string]: string[]};
		if (!cached && !rBase) {
			changes = await EdoDiffApi.getFileDiff(stage);
		} else {
			if (cached) {
				changes = await EdoDiffApi.getFileDiff(`remote/${stage}`);
			} else {
				changes = await EdoDiffApi.getFileDiff(`remote/${stage}`, true);
			}
		}

		const files = Object.keys(changes);
		let hasChanges: boolean = false;

		for (const key of files) {
			if (!isNullOrUndefined(argv.files) && argv.files.length > 0 && argv.files.indexOf(key) < 0) continue;
			const output: string[] = await EdoDiffApi.diff(key, changes[key]);
			if (output.length > 0) {
				hasChanges = true;
				// show diff output
				let colors = true;
				if (!colors) {
					console.log(output.join("\n"));
				} else {
					for (let line of output) {
						if (line[0] == ' ') {
							console.log(line); // normal
						} else if (line[0] == '=' || line.startsWith('--- ') || line.startsWith('+++ ')) {
							console.log('\x1b[1m\x1b[37m%s\x1b[0m', line); // white
						} else if (line[0] == '-') {
							console.log('\x1b[31m%s\x1b[0m', line); // red
						} else if (line[0] == '+') {
							console.log('\x1b[32m%s\x1b[0m', line); // green
						}
					}
				}
			}
		} // for-end

		if (!hasChanges) {
			console.log("no changes in working directory!");
			process.exit(0);
		}
	}

}
