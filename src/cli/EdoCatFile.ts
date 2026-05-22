import yargs, { Argv } from "yargs";
import { EdoCache } from "../api/EdoCache";

/**
 * Endevor fetch remote stage to local
 */
export class EdoCatFile {
	private static readonly edoCatFile: yargs.PositionalOptions = {
		describe: 'sha1 of file cat',
		type: "string"
	};

	public static edoCatOptions(argv: Argv) {
		return argv
			.positional('file', EdoCatFile.edoCatFile);
	}


	/**
	 *
	 * @param argv
	 */
	public static async process(argv: any): Promise<void> {
		try {
			if (argv.file) {
				const out: Buffer = await EdoCache.getSha1Object(argv.file);
				process.stdout.write(out);
			} else {
				process.exit(1);
			}
		} catch (err) {
			console.error("Error while running cat-file!");
			console.error((err as Error).message);
			process.exit(1);
		}
	}
}
