import yargs from "yargs";
import { EdoCache } from "../api/EdoCache";
import { isNullOrUndefined } from "util";
import { IEdoIndex } from "../api/doc/IEdoIndex";
import { FileUtils } from "../api/utils/FileUtils";

/**
 * Endevor fetch remote stage to local
 */
export class EdoShow {
	private static readonly edoShowObject : yargs.PositionalOptions = {
		describe: 'sha1 or reference to object in edo database e.g.: STAGE~1:typeName/eleName, DEV-1-ESCM180-DXKL~5:typeName/eleName',
		type: "string"
	};

	public static edoShowOptions = {
		object: EdoShow.edoShowObject
	};


	/**
	 *
	 * @param argv
	 */
	public static async process(argv: any) {
		const object: string = argv.object;
		if (isNullOrUndefined(object)) {
			console.error("No object specified!");
			return 1;
		}

		// STAGE~1:typeName/eleName
		let refs = object.match(/^([^~]+)(~(.+))*:(.+)$/);
		if (isNullOrUndefined(refs)) {
			console.error(`Invalid object name ${object}`);
			process.exit(1);
			return;
		}
		if (isNullOrUndefined(refs[2])) {
			refs[3] = "0";
		}

		let stage: string = refs[1];
		let backref: number = parseInt(refs[3]);
		let file: string = refs[4];
		if (refs[1] == 'remote/STAGE') {
			stage = 'remote/' + (await FileUtils.readStage(true));
		}
		if (refs[1] == 'STAGE' || refs[1] == 'HEAD') {
			stage = await FileUtils.readStage(true);
		}

		try {
			const index: IEdoIndex = await EdoCache.getIndex(stage, backref);
			if (isNullOrUndefined(index.elem[file])) {
				console.error(`File '${file}' doesn't exist in ${refs[1]}${refs[2]}!`);
				process.exit(1);
			}
			let fileSha1 = index.elem[file][0];
			if (index.prev == 'base') {
				fileSha1 = index.elem[file][1];
			}
			const out: Buffer = await EdoCache.getSha1Object(fileSha1, EdoCache.OBJ_BLOB);
			process.stdout.write(out);
		} catch (err) {
			console.error("Error while running show!");
			console.error(err.message);
			process.exit(1);
		}
	}
}
