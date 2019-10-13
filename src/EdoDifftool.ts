import yargs from "yargs";
import { FileUtils as fu } from "./utils/FileUtils";
import path from "path";
import { HashUtils as hash } from "./utils/HashUtils";
import { spawn, spawnSync, exec } from "child_process";

/**
 * Endevor restore working directory to local or remote (like discard)
 */
export class EdoDifftool {
	private static readonly edoDifftoolFile : yargs.PositionalOptions = {
		describe: 'Use difftool on file to diff against local/remote stage'
	};

	private static readonly edoDifftoolCommit : yargs.Options = {
		describe: 'Use difftool on commited changes against remote changes (local stage with remote stage)',
		demand: false,
		boolean: true,
		alias: 'c'
	};


	public static edoDifftoolOptions = {
		file: EdoDifftool.edoDifftoolFile,
		commit: EdoDifftool.edoDifftoolCommit
	};


	/**
	 *
	 * @param argv
	 */
	public static async difftool(argv: any) {
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

		let lines = Object.values(eleList);
		let hasChanges: boolean = false;
		let output: string[] = [];

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
						const oldFile = `${localStageDir}/${fu.remote}/${tmpItem[0]}`;
						const oldStr = (await fu.readfile(oldFile));
						const tempPath = await fu.createTempFile(oldStr);
						execDiffTool(tempPath, file);
						hasChanges = true;
					}
				} else if (tmpItem[1] != 'rsha1') {
					if (lsha1 != tmpItem[1]) {
						// changes against remote
						const oldFile = `${localStageDir}/${fu.remote}/${tmpItem[1]}`;
						const oldStr = (await fu.readfile(oldFile));
						const tempPath = await fu.createTempFile(oldStr);
						execDiffTool(tempPath, file);
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