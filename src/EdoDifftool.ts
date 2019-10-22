import yargs from "yargs";
import { FileUtils as fu } from "./utils/FileUtils";
import path from "path";
import { HashUtils as hash } from "./utils/HashUtils";
import { spawn, spawnSync, exec } from "child_process";
import { isNullOrUndefined } from "util";
import { removeListener } from "cluster";

/**
 * Endevor restore working directory to local or remote (like discard)
 */
export class EdoDifftool {
	private static readonly edoDifftoolFile : yargs.PositionalOptions = {
		describe: 'Use difftool on file to diff against local/remote stage'
	};

	private static readonly edoDifftoolCached : yargs.Options = {
		describe: 'Use difftool on commited changes against remote changes (local stage with remote stage)',
		demand: false,
		boolean: true,
		conflicts: "remote",
		alias: 'c'
	};

	private static readonly edoDifftoolRemote : yargs.Options = {
		describe: 'Use difftool on file changes against remote changes (working directory files with remote stage)',
		demand: false,
		boolean: true,
		conflicts: "cached",
		alias: 'r'
	};

	public static edoDifftoolOptions = {
		file: EdoDifftool.edoDifftoolFile,
		cached: EdoDifftool.edoDifftoolCached,
		remote: EdoDifftool.edoDifftoolRemote
	};


	/**
	 *
	 * @param argv
	 */
	public static async difftool(argv: any) {
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

		for (let item of lines) {
			let tmpItem = fu.splitX(item, ',', 4);
			let eleParts = fu.splitX(tmpItem[4], '-', 1);
			let bFile = `./${eleParts[0]}/${eleParts[1]}`;
			if (cached) {
				if (tmpItem[0] == 'lsha1') continue; // for non-existent local commit, skip
				bFile = `${localStageDir}/${fu.remote}/${tmpItem[0]}`;
				try {
					const cacheStr = (await fu.readfile(bFile));
					bFile = await fu.createTempFile(cacheStr); // create temp for difftool (don't provide internal file)
				} catch (err) {
					console.error(`Error processing file './${eleParts[0]}/${eleParts[1]}': ${err}`);
					continue;
				}
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

				let oldFile = `${localStageDir}/${fu.remote}/${rsha1}`;
				const oldStr = (await fu.readfile(oldFile));
				const aFile = await fu.createTempFile(oldStr); // create temp for difftool (don't provide internal file)
				execDiffTool(aFile, bFile);
				hasChanges = true;
			} catch (err) {
				// error while reading file, so don't commit it.
				console.error(`Error processing file './${eleParts[0]}/${eleParts[1]}': ${err}`);
				continue;
			}
		}

		if (hasChanges) {
			// show diff output
			console.log("difftool started!");
		} else {
			console.log("no changes in working directory!");
		}

	}

}

function execDiffTool(oldFile: string, newFile: string) {
	let cmd = exec(`code --diff ${oldFile} ${newFile}`, (err, stdout, stderr) => {
		if (err)
			console.log(err);
		if (stdout)
			console.log(stdout);
		if (stderr)
			console.log(stderr);

		// delete after vscode loaded it
		setTimeout(() => {
			fu.unlink(oldFile);
		}, 2000);
	});
	cmd.on("close", (code) => {
		// console.log("closed!!" + code);
	});
	cmd.on("exit", (code) => {
		// console.log("exit!!" + code);
	});
}