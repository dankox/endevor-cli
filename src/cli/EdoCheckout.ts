import yargs from "yargs";
import { FileUtils as fu } from "../api/utils/FileUtils";
import { EdoCheckoutApi } from "../api/EdoCheckoutApi";

/**
 * Endevor checkout stage (on local)
 */
export class EdoCheckout {
	private static readonly edoCheckoutStage : yargs.PositionalOptions = {
		describe: 'Name of stage to checkout (env-stg-sys-sub)'
	};

	public static edoCheckoutOptions = {
		stage: EdoCheckout.edoCheckoutStage
	};


	/**
	 *
	 * @param argv
	 */
	public static async process(argv: any) {
		let stage: string = argv.stage;

		// TODO: if nonexistent directory but in directory version like (error)
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

		try {
			await EdoCheckoutApi.checkout(stage);
		} catch (err) {
			console.error("Error while running checkout!");
			console.error(err.message);
			process.exit(1);
		}
	}

}
