import yargs from "yargs";
import { FileUtils } from "../api/utils/FileUtils";
import { isNullOrUndefined } from "util";
import { EdoDiffApi } from "../api/EdoDiffApi";
import { EdoCache } from "../api/EdoCache";
import { ConsoleUtils } from "../api/utils/ConsoleUtils";
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
		const tConflict: string = "conflict:    ";
		const tAdded: string    = "added:       ";
		const tDeleted: string  = "deleted:     ";

		let ignoreSpace: boolean = false;
		let porcelain: boolean = false;
		if (!isNullOrUndefined(argv['ignore-space'])) ignoreSpace = true;
		if (!isNullOrUndefined(argv.porcelain)) porcelain = true;

		const stage: string = await FileUtils.readStage();
		if (!HashUtils.isSha1(stage)) {
			console.log(`On stage ${stage}`);
			console.log("There is no index for this stage, run 'edo fetch' and 'edo merge', or just run 'edo pull'");
			process.exit(0);
		}

		if (!porcelain) {
			const lIndex = await EdoCache.readIndex(stage);
			const rsha1 = await FileUtils.readRefs(lIndex.stgn, true);
			console.log(`On stage ${lIndex.stgn}`);

			if (rsha1 != null) {
				const rIndex = await EdoCache.readIndex(rsha1);
				const fingers = EdoDiffApi.diffIndexFinger(lIndex, rIndex);
				const diffIdx = EdoDiffApi.getIndexDiff(lIndex, rIndex);
				if (fingers.length > 0) {
					console.log(`Your stage is behind with 'remote/${lIndex.stgn}. Run 'edo merge'.`);
				} else {
					const diffIdxKeys = Object.keys(diffIdx);
					const addedFIles = diffIdxKeys.filter(item => (diffIdx[item][1] == 'null'));
					const deletedFIles = diffIdxKeys.filter(item => (diffIdx[item][0] == 'null'));
					// fingerprints match, but difference in files between remote and local
					if (addedFIles.length > 0 || deletedFIles.length >0) {
						console.log(`Your stage has different files than 'remote/${lIndex.stgn}.`);
						console.log(`Changes in commits between local and remote stage:`);
						console.log(`  (added or deleted files in local stage are shown)`);
						console.log(`  (use 'edo push' to push changes into the remote repo/stage)`);
						console.log(`  (use 'edo merge' to add files from remote to local stage)`);
						console.log(`  (use 'rm <file>..' and 'edo commit -a' to remove files which were deleted in remote repo/stage)`);
						for (const file of addedFIles) {
							console.log('       %s%s%s%s', ConsoleUtils.cCyan, tAdded, file, ConsoleUtils.cReset);
						}
						for (const file of deletedFIles) {
							console.log('       %s%s%s%s', ConsoleUtils.cCyan, tDeleted, file, ConsoleUtils.cReset);
						}
						console.log(); // add new line
					} else {
						console.log(`Your stage is up to date with 'remote/${lIndex.stgn}.`);
					}
				}
			} else {
				console.error("no remote tracking stage! run 'edo fetch'...");
			}
		}

		// get changes in the working directory against local stage
		const changes = await EdoDiffApi.getFileDiff(stage);
		const files = Object.keys(changes);
		let hasChanges: boolean = false;

		let modified: string[] = [];
		let untracked: string[] = [];
		let conflicts: string[] = [];
		let mergeConflicts: string[] = await FileUtils.getConflictFiles();

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
					if (mergeConflicts.length > 0 && mergeConflicts.indexOf(key) != -1) {
						if (porcelain) untracked.push(`C ${key}`);
						conflicts.push(key);
					} else {
						if (porcelain) untracked.push(`M ${key}`);
						modified.push(key);
					}
					hasChanges = true;
				}
			} else {
				if (mergeConflicts.length > 0 && mergeConflicts.indexOf(key) != -1) {
					if (porcelain) untracked.push(`C ${key}`);
					conflicts.push(key);
				} else {
					if (porcelain) untracked.push(`M ${key}`);
					modified.push(key);
				}
				hasChanges = true;
			}
		} // for-end

		if (!hasChanges) {
			// if (!porcelain)
			// 	console.log("no changes in working directory!");
		} else if (porcelain) {
			// parsable output for scripts
			for (const file of untracked) {
				console.log(file);
			}
		} else {
			if (modified.length > 0 || conflicts.length > 0) {
				console.log('Changes able to commit:');
				console.log(`  (use 'edo commit' or 'edo commit <file>...' to commit changes to local stage)`);
				console.log(`  (use 'edo restore [files]...' to discard changes in working directory)`);
				for (const file of modified) {
					console.log('       %s%s%s%s', ConsoleUtils.cGreen, tModified, file, ConsoleUtils.cReset); // green
				}
				for (const file of conflicts) {
					console.log('       %s%s%s%s', ConsoleUtils.cRed, tConflict, file, ConsoleUtils.cReset); // red
				}
				console.log(); // new line
			}
			if (untracked.length > 0) {
				console.log('Untracked files:');
				console.log(`  (use 'edo add/rm <file>...' or 'edo commit -a' to add to local stage)`);
				for (const file of untracked) {
					console.log('       %s%s%s', ConsoleUtils.cRed, file.replace('A ', tAdded).replace('D ', tDeleted).replace('C ', tConflict), ConsoleUtils.cReset); // red
				}
				console.log(); // new line
			}
		}
	}

}
