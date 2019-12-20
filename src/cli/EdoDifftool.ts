import yargs from "yargs";
import { FileUtils } from "../api/utils/FileUtils";
import { isNullOrUndefined } from "util";
import { EdoDiffApi } from "../api/EdoDiffApi";
import { EdoCache } from "../api/EdoCache";
import { HashUtils } from "../api/utils/HashUtils";
import { spawnSync } from "child_process";
import { ConsoleUtils } from "../api/utils/ConsoleUtils";

/**
 * Edo diff files in working directory with checked out stage
 */
export class EdoDifftool {
	private static readonly edoDifftoolStage : yargs.PositionalOptions = {
		describe: 'Name or sha1 id of stage for diff',
		type: "string"
	};

	private static readonly edoDifftoolFiles : yargs.PositionalOptions = {
		describe: 'File names which you want to diff with local/remote stage'
	};

	private static readonly edoNameOnly : yargs.Options = {
		describe: 'Show only names of changed files.',
		demand: false,
		boolean: true
	};

	private static readonly edoIgnoreSpace : yargs.Options = {
		describe: 'Ignore white space (leading and trailing blank) changes.',
		demand: false,
		alias: 'is',
		boolean: true
	};

	private static readonly edoDifftoolBase : yargs.Options = {
		describe: 'Diff files with base changes on specified stage (old stage or current stage).',
		demand: false,
		boolean: true,
		conflicts: "cached",
		alias: 'b'
	};

	public static edoDifftoolOptions(argv: typeof yargs) {
		return argv
			.option('base', EdoDifftool.edoDifftoolBase)
			.option('ignore-space', EdoDifftool.edoIgnoreSpace)
			.positional('stage-new', EdoDifftool.edoDifftoolStage)
			.positional('stage-old', EdoDifftool.edoDifftoolStage)
			.positional('files', EdoDifftool.edoDifftoolFiles);
	}


	/**
	 *
	 * @param argv
	 */
	public static async process(argv: any) {
		let stageNew: string = '';
		let stageOld: string = '';
		let files: string[] = [];

		// setup stage-new stage-old and files to correct values
		if (argv['stage-new']) files.push(argv['stage-new']);
		if (argv['stage-old']) files.push(argv['stage-old']);
		if (argv['files']) files.push(...argv['files']);
		if (files.length > 0) {
			if (HashUtils.isSha1(files[0])) {
				stageNew = files[0];
				files.shift();
			} else if (files[0].match(/^(remote\/)*STAGE/) || files[0].startsWith('.map') || files[0].match(/^(remote\/)*[^\/]+-.+-.+-.+$/)) {
				stageNew = files[0];
				files.shift();
			}
			if (files.length > 0) {
				if (HashUtils.isSha1(files[0])) {
					stageOld = files[0];
					files.shift();
				} else if (files[0].match(/^(remote\/)*STAGE/) || files[0].startsWith('.map') || files[0].match(/^(remote\/)*[^\/]+-.+-.+-.+$/)) {
					stageOld = files[0];
					files.shift();
				}
			}
		}
		if (stageOld == '' && stageNew == '') {
			stageOld = 'STAGE';
		} else if (stageOld == '') {
			stageOld = stageNew;
			stageNew = '';
		}

		// setup options
		let base: boolean = !isNullOrUndefined(argv.base) ? argv.base : false;
		let nameOnly: boolean = !isNullOrUndefined(argv["name-only"]) ? argv["name-only"] : false;
		let ignoreSpace: boolean = !isNullOrUndefined(argv["ignore-space"]) ? argv["ignore-space"] : false;

		try {
			let changes: {[key: string]: string[]};
			// get changes between working directory and stage
			if (stageNew == '') {
				let stage: string = (stageOld.match(/^(remote\/)*STAGE/) ? stageOld.replace('STAGE', (await FileUtils.readStage(true))) : stageOld);
				changes = await EdoDiffApi.getFileDiff(stage, base);

			// get changes between two stages
			} else {
				stageOld = (stageOld.match(/^(remote\/)*STAGE/) ? stageOld.replace('STAGE', (await FileUtils.readStage(true))) : stageOld);
				stageNew = (stageNew.match(/^(remote\/)*STAGE/) ? stageNew.replace('STAGE', (await FileUtils.readStage(true))) : stageNew);
				const newSha1 = await FileUtils.readRefs(stageNew);
				const oldSha1 = await FileUtils.readRefs(stageOld);
				if (newSha1 != null && oldSha1 != null) {
					const newIndex = await EdoCache.readIndex(newSha1);
					const oldIndex = await EdoCache.readIndex(oldSha1);
					changes = EdoDiffApi.getIndexDiff(newIndex, oldIndex, base);
				} else {
					if (newSha1 == null) console.error(`Error while reading stage ${stageNew}. Doesn't exist, run 'edo fetch ${stageNew}'...`);
					if (oldSha1 == null) console.error(`Error while reading stage ${stageOld}. Doesn't exist, run 'edo fetch ${stageOld}'...`);
					process.exit(1);
					return; // ts-lint reason
				}
			}

			const changedFiles = Object.keys(changes);
			let hasChanges: boolean = false;

			for (const key of changedFiles) {
				if (!isNullOrUndefined(files) && files.length > 0 && files.indexOf(key) < 0) continue;

				if (changes[key][0] == 'null') {
					// don't deal with delete (yet???)
					continue;
				} else if (changes[key][1] == 'null') {
					// don't deal with add (yet???)
					continue;
				} else if (ignoreSpace) {
					const output: string[] = await EdoDiffApi.diff(key, changes[key], ignoreSpace);
					if (output.length == 0) continue;
				}

				hasChanges = true;
				let yn = await ConsoleUtils.promptValue(`Diffing file ${key} [Y/n]`, 'y');
				if (yn.toLowerCase() == 'n' || yn.toLowerCase() == 'no') continue;

				let local: string = '';
				let remote: string = '';
				let lTmp: boolean = false;
				let rTmp: boolean = false;
				if (HashUtils.isSha1(changes[key][0])) {
					const buf: Buffer = await EdoCache.getSha1Object(changes[key][0], EdoCache.OBJ_BLOB);
					local = await FileUtils.createTempFile(buf);
					lTmp = true;
				} else {
					local = key;
				}
				if (HashUtils.isSha1(changes[key][1])) {
					const buf: Buffer = await EdoCache.getSha1Object(changes[key][1], EdoCache.OBJ_BLOB);
					remote = await FileUtils.createTempFile(buf);
					rTmp = true;
				} else {
					remote = key;
				}

				// TODO: make customizable thru config file (to use vim or so)
				spawnSync('code', ['--wait', '--diff', remote, local], { shell: true });

				// remove temporary files
				if (lTmp) {
					await FileUtils.unlink(local);
				}
				if (rTmp) {
					await FileUtils.unlink(remote);
				}

			} // for-end

			if (!hasChanges) {
				console.log("no changes in working directory!");
				process.exit(0);
			}
		} catch (err) {
			console.error("Error while running diff!");
			console.error(err.message);
			process.exit(1);
		}
	}

}
