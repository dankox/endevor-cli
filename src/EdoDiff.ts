import yargs from "yargs";
import { FileUtils as fu } from "./utils/FileUtils";
import path from "path";
import { isNullOrUndefined } from "util";
import { HashUtils as hash } from "./utils/HashUtils";
import * as diff from "diff";

/**
 * Endevor restore working directory to local or remote (like discard)
 */
export class EdoDiff {
	private static readonly edoDiffFile : yargs.PositionalOptions = {
		describe: 'File name which you want to diff with local/remote stage'
	};

	private static readonly edoDiffCommit : yargs.Options = {
		describe: 'Diff commited changes with remote changes (local stage with remote stage)',
		demand: false,
		boolean: true,
		alias: 'c'
	};
	private static readonly edoDiffCached : yargs.Options = {
		describe: 'Diff commited changes with remote changes (local stage with remote stage)',
		demand: false,
		boolean: true,
		conflicts: "remote",
		alias: 'c'
	};

	private static readonly edoDiffRemote : yargs.Options = {
		describe: 'Diff working directory against remote changes',
		demand: false,
		boolean: true,
		conflicts: "cached",
		alias: 'r'
	};

	public static edoDiffOptions = {
		file: EdoDiff.edoDiffFile,
		cached: EdoDiff.edoDiffCached,
		remote: EdoDiff.edoDiffRemote
	};


	/**
	 *
	 * @param argv
	 */
	public static async diff(argv: any) {
		let stage = await fu.getStage();

		// cached, it's always commited changes against remote version
		let cached: boolean = !isNullOrUndefined(argv.cached) ? argv.cached : false;
		// remote, workdir file against remote version
		let remote: boolean = !isNullOrUndefined(argv.remote) ? argv.remote : false;

		let eleList: { [key: string]: string } = {};
		try {
			eleList = await fu.getEleListFromStage(stage);
		} catch (err) {
			// index doesn't exists, this should work only if file argument is specified
			console.log("There is no index for this stage.");
			process.exit(1);
		}

		let localStageDir = `${fu.edoDir}/${fu.mapDir}/${stage}`;

		let lines = Object.values(eleList);
		let hasChanges: boolean = false;
		let output: string[] = [];

		for (let item of lines) {
			let tmpItem = fu.splitX(item, ',', 4);
			let eleParts = fu.splitX(tmpItem[4], '-', 1);
			let bFile = `./${eleParts[0]}/${eleParts[1]}`;
			if (cached) {
				if (tmpItem[0] == 'lsha1') continue; // for non-existent local commit, skip
				bFile = `${localStageDir}/${fu.remote}/${tmpItem[0]}`;
			}
			if (!await fu.exists(bFile)) {
				if (tmpItem[0] == 'lsha1' && tmpItem[1] == 'rsha1') {
					continue; // doesn't exists in work directory, local or in remote
				}
				console.log(`'${bFile}' deleted... !!! DOESN'T WORK NOW!!!`); // TODO: not working currently (not sure how to handle deletion)
				hasChanges = true;
				continue; // next one... sha1 check not necessary
			}
			try {
				let lsha1 = tmpItem[0]; // get first local sha1
				let rsha1 = tmpItem[1]; // get remote sha1
				if (!cached) { // not cached, get the real file sha1
					lsha1 = await hash.getFileHash(bFile);
				} else if (lsha1 == 'lsha1') {
					continue; // cached, but there is no cache
				}
				if (!remote && !cached) {
					if (tmpItem[0] != 'lsha1') {
						rsha1 = tmpItem[0]; // not --remote or --cached and there is local
					} else if (rsha1 == 'rsha1') {
						// TODO: nothing in local or remote (cannot compare maybe put ++ for full file?)
						continue; // remote is not set and neither is local
					}
				} else if (rsha1 == 'rsha1') {
					// TODO: there is no remote and we want it (because of remote or cached)
					continue;
				}
				if (lsha1 == rsha1) continue; // if no diff, skip

				let ignoreTrailingSpace = true;
				let aFile = `${localStageDir}/${fu.remote}/${rsha1}`;
				const oldStr = (await fu.readfile(aFile, ignoreTrailingSpace)).toString();
				const newStr = (await fu.readfile(bFile, ignoreTrailingSpace)).toString();
				// output.push(diff.createTwoFilesPatch(`a/${eleParts[0]}/${eleParts[1]}`, `b/${eleParts[0]}/${eleParts[1]}`, oldStr, newStr));
				output.push(...diff.createTwoFilesPatch(`a/${eleParts[0]}/${eleParts[1]}`, `b/${eleParts[0]}/${eleParts[1]}`, oldStr, newStr).split('\n'));
				hasChanges = true;
			} catch (err) {
				// error while reading file, so don't commit it.
				console.error(`Error reading file '${bFile}: ${err}`);
				continue;
			}
		}

		if (hasChanges) {
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
		} else {
			console.log("no changes in working directory!");
		}

		// }
	}

}