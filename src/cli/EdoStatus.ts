import yargs from "yargs";
import { FileUtils } from "../api/utils/FileUtils";
import { isNullOrUndefined } from "util";
import { EdoDiffApi } from "../api/EdoDiffApi";
import { EdoCache } from "../api/EdoCache";
import { HashUtils } from "../api/utils/HashUtils";

/**
 * Endevor restore working directory to local or remote (like discard)
 */
export class EdoStatus {
	private static readonly edoStatusStage : yargs.PositionalOptions = {
		describe: 'Stage to check status against. Useful if you want to check current work directory status change against different stage.'
	};

	private static readonly edoStatusIgnoreSpace : yargs.Options = {
		describe: `Diff will be triggered on changed files to check for trailing space changes. If it's just that, ignore it.`,
		demand: false,
		boolean: true,
		alias: 'is'
	};

	private static readonly edoStatusPorcelain : yargs.Options = {
		describe: `Status will be printed in more script readable format.`,
		demand: false,
		boolean: true
	};

	public static edoStatusOptions = {
		"ignore-space": EdoStatus.edoStatusIgnoreSpace,
		porcelain: EdoStatus.edoStatusPorcelain,
		stage: EdoStatus.edoStatusStage
	};


	/**
	 *
	 * @param argv
	 */
	public static async process(argv: any) {
		const tModified: string = "modified:    ";
		const tAdded: string    = "added:       ";
		const tDeleted: string  = "deleted:     ";

		let ignoreSpace: boolean = false;
		let porcelain: boolean = false;
		if (!isNullOrUndefined(argv['ignore-space'])) ignoreSpace = true;
		if (!isNullOrUndefined(argv.porcelain)) porcelain = true;

		const stage: string = await FileUtils.readStage();
		const lIndex = await EdoCache.readIndex(stage);
		const rsha1 = await FileUtils.readRefs(lIndex.stgn, true);

		if (!porcelain) {
			console.log(`On stage ${lIndex.stgn}`);

			if (rsha1 != null) {
				const rIndex = await EdoCache.readIndex(rsha1);
				const fingers = EdoDiffApi.diffIndexFinger(lIndex, rIndex);
				if (fingers.length > 0) {
					console.log(`Your stage is behind with 'remote/${lIndex.stgn}. Run 'edo merge'.`);
				} else {
					console.log(`Your stage is up to date with 'remote/${lIndex.stgn}.`);
				}
			} else {
				console.error("no remote tracking stage! run 'edo fetch'...");
			}
		}

		// // cached, it's always commited changes against remote version
		// let cached: boolean = !isNullOrUndefined(argv.cached) ? argv.cached : false;
		// // remote, workdir file against remote version
		// let remote: boolean = !isNullOrUndefined(argv.remote) ? argv.remote : false;

		// get changes in the working directory against local stage
		const changes = await EdoDiffApi.getFileDiff(stage);
		const files = Object.keys(changes);
		let hasChanges: boolean = false;

		let modified: string[] = [];
		let untracked: string[] = [];
		for (const key of files) {
			if (changes[key][1] == 'null') {
				untracked.push(`A ${key}`);
				hasChanges = true;
				continue;
			}
			if (changes[key][0] == 'null') {
				untracked.push(`D ${key}`);
				hasChanges = true;
				continue;
			}

			if (ignoreSpace) {
				const output: string[] = await EdoDiffApi.diff(key, changes[key]);
				if (output.length > 0) {
					if (porcelain) untracked.push(`M ${key}`);
					modified.push(key);
					hasChanges = true;
				}
			} else {
				if (porcelain) untracked.push(`M ${key}`);
				modified.push(key);
				hasChanges = true;
			}
		} // for-end

		if (!hasChanges) {
			if (!porcelain)
				console.log("no changes in working directory!");
		} else if (porcelain) {
			for (const file of untracked) {
				console.log(file);
			}
		} else {
			if (modified.length > 0) {
				console.log('Changes able to commit:');
				console.log(`  (use 'edo commit' or 'edo commit <file>...' to commit changes to local stage)`);
				console.log(`  (use 'edo restore [files]...' to discard changes in working directory)`);
				for (const file of modified) {
					console.log('       \x1b[32m%s%s\x1b[0m', tModified, file); // green
				}
			}
			if (untracked.length > 0) {
				console.log('Untracked files:');
				console.log(`  (use 'edo add/rm <file>...' or 'edo commit -a' to add to local stage)`);
				for (const file of untracked) {
					console.log('       \x1b[31m%s\x1b[0m', file.replace('A ', tAdded).replace('D ', tDeleted)); // red
				}
			}
		}
	}

}
