import yargs from "yargs";
import { FileUtils as fu } from "./utils/FileUtils";

/**
 * Endevor checkout stage (on local)
 */
export class EdoCheckout {
	private static readonly edoCheckoutStage : yargs.PositionalOptions = {
		describe: 'Name of stage to checkout (env-stg-sys-sub)'
	}

	public static edoCheckoutOptions = {
		stage: EdoCheckout.edoCheckoutStage
	}


	/**
	 *
	 * @param argv
	 */
	public static async checkout(argv: any) {
		let stage: string = argv.stage;

		if (await fu.exists(stage)) {
			// get the final full stage in env-stg-sys-sub format
			if (stage.startsWith(".map/")) {
				let dirs = stage.split('/');
				if (dirs.length > 4)
					dirs = dirs.slice(0, 4);
				stage = dirs.slice(1).join('-');
			} else if (stage.startsWith(".map\\")) {
				let dirs = stage.split('\\');
				if (dirs.length > 4)
					dirs = dirs.slice(0, 4);
				stage = dirs.slice(1).join('-');
			}
		}
		console.log("checkout map stage: " + stage);
		let localStageDir = `${fu.edoDir}/${fu.mapDir}/${stage}`;

		if (await fu.exists(localStageDir)) {

		} else {
			await fu.mkdir(`${fu.edoDir}/${fu.mapDir}/${stage}`);
		}
		await fu.writefile(`${fu.edoDir}/${fu.stageFile}`, Buffer.from(stage));
	}

}
