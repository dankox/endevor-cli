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


	public static edoDiffOptions = {
		file: EdoDiff.edoDiffFile,
		commit: EdoDiff.edoDiffCommit
	};


	/**
	 *
	 * @param argv
	 */
	public static async diff(argv: any) {
		let stage = await fu.getStage();

		let eleList: { [key: string]: string } = {};
		try {
			eleList = await fu.getEleListFromStage(stage);
		} catch (err) {
			// index doesn't exists, this should work only if file argument is specified
			console.log("There is no index for this stage.");
			process.exit(1);
		}

		let localStageDir = `${fu.edoDir}/${fu.mapDir}/${stage}`;
		// if (!isNullOrUndefined(argv.file)) {
		// 	let fileRestore: string = argv.file;
		// 	if (!await fu.exists(fileRestore)) {
		// 		console.error(`File '${fileRestore}' doesn't exists!`);
		// 		process.exit(1);
		// 	}
		// 	let dirRestore: string = path.dirname(fileRestore);
		// 	fileRestore = path.basename(fileRestore);
		// 	dirRestore = path.basename(dirRestore);
		// 	let elementIdx = `${dirRestore}-${fileRestore}`;
		// 	await restoreFile(localStageDir, eleList[elementIdx]);
		// 	console.log("file restored!");
		// } else {

		let lines = Object.values(eleList);
		let hasChanges: boolean = false;
		let output: string[] = [];
		// for (let item of lines) {
		// 	await commitFile(localStageDir, item);
		// }
		for (let item of lines) {
			let tmpItem = fu.splitX(item, ',', 4);
			let eleParts = fu.splitX(tmpItem[4], '-', 1);
			let file = `./${eleParts[0]}/${eleParts[1]}`;
			if (!await fu.exists(file)) {
				if (tmpItem[0] == 'lsha1' && tmpItem[1] == 'rsha1') {
					continue; // doesn't exists in work directory, local or in remote
				}
				console.log(`'${file}' deleted... !!! DOESN'T WORK NOW!!!`); // TODO: not working currently (not sure how to handle deletion)
				hasChanges = true;
				continue; // next one... sha1 check not necessary
			}
			try {
				let lsha1 = await hash.getFileHash(file);
				let ignoreTrailingSpace = true;
				if (tmpItem[0] != 'lsha1') {
					if (lsha1 != tmpItem[0]) {
						// changes against local
						const oldStr = (await fu.readfile(`${localStageDir}/${fu.remote}/${tmpItem[0]}`, ignoreTrailingSpace)).toString();
						const newStr = (await fu.readfile(file, ignoreTrailingSpace)).toString();
						// output.push(diff.createTwoFilesPatch(`a/${eleParts[0]}/${eleParts[1]}`, `b/${eleParts[0]}/${eleParts[1]}`, oldStr, newStr));
						output.push(...diff.createTwoFilesPatch(`a/${eleParts[0]}/${eleParts[1]}`, `b/${eleParts[0]}/${eleParts[1]}`, oldStr, newStr).split('\n'));
						hasChanges = true;
					}
				} else if (tmpItem[1] != 'rsha1') {
					if (lsha1 != tmpItem[1]) {
						// changes against remote
						const oldStr = (await fu.readfile(`${localStageDir}/${fu.remote}/${tmpItem[1]}`, ignoreTrailingSpace)).toString();
						const newStr = (await fu.readfile(file, ignoreTrailingSpace)).toString();
						output.push(...diff.createTwoFilesPatch(`a/${eleParts[0]}/${eleParts[1]}`, `b/${eleParts[0]}/${eleParts[1]}`, oldStr, newStr).split('\n'));
						hasChanges = true;
					}
				} else {
					// TODO: nothing in local or remote (cannot compare maybe put ++ for full file?)
				}
			} catch (err) {
				// error while reading file, so don't commit it.
				console.error(`Error reading file '${file}: ${err}`);
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