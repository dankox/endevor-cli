import yargs from 'yargs';
import { FileUtils } from '../api/utils/FileUtils';
import { EdoCommitApi } from '../api/EdoCommitApi';
import { isNullOrUndefined } from 'util';

/**
 * Edo commit changes in working directory to local stage
 */
export class EdoCommit {
	private static readonly edoCommitFile : yargs.PositionalOptions = {
		describe: 'File names which you want to commit to local stage',
		type: "string"
	};

	private static readonly edoCommitAll : yargs.Options = {
		describe: 'Commit untracked changes, like newly added files or deleted files',
		boolean: true,
		demand: false,
		alias: 'a'
	};

	public static edoCommitOptions = {
		files: EdoCommit.edoCommitFile,
		all: EdoCommit.edoCommitAll
	};

	/**
	 * commit
	 */
	public static async process(argv: any) {
		try {
			let stage: string = await FileUtils.readStage();
			let files: string[] = (isNullOrUndefined(argv.files) ? [] : argv.files);
			const all: boolean = (isNullOrUndefined(argv.all) ? false : argv.all);

			await EdoCommitApi.commit(stage, files, all);
		} catch (err) {
			console.error("Error while running commit!");
			console.error(err.message);
			process.exit(1);
		}
	}

}
