import yargs from "yargs";
import { EdoCache } from "../api/EdoCache";
import { isNullOrUndefined } from "util";
import { IEdoIndex } from "../api/doc/IEdoIndex";
import { FileUtils } from "../api/utils/FileUtils";

/**
 * Endevor fetch remote stage to local
 */
export class EdoShow {
	private static readonly edoShowLogs : yargs.Options = {
		describe: `Show log details of specified file in remote stage, or show content of specified change.
To show log details, specify object with stage only (remote/STAGE:typeName/eleName).
To show content of log, specify object with stage and back reference (remote/STAGE~0102:typeName/eleName)`,
		boolean: true,
		demand: false,
		alias: 'l'
	};

	private static readonly edoShowObject : yargs.PositionalOptions = {
		describe: 'sha1 or reference to object in edo database e.g.: STAGE~1:typeName/eleName, DEV-1-ESCM180-DXKL~5:typeName/eleName',
		type: "string"
	};

	public static edoShowOptions(argv: typeof yargs) {
		return argv
			.options('logs', EdoShow.edoShowLogs)
			.positional('object', EdoShow.edoShowObject);
	}


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

		const logs: boolean = !isNullOrUndefined(argv.logs) ? argv.logs : false;
		let hasfile: boolean = true;

		// STAGE~1:typeName/eleName
		let refs = object.match(/^([^\:~]+)(~([^\:]+))*(:(.+))*$/);
		if (isNullOrUndefined(refs)) {
			console.error(`Invalid object name ${object}`);
			process.exit(1);
			return;
		}
		if (isNullOrUndefined(refs[2])) {
			refs[3] = "0";
		}
		if (isNullOrUndefined(refs[4])) {
			hasfile = false;
		}

		// check if stage matches remote/env-1-sys-sub
		if (!refs[1].match(/^(remote\/)*STAGE/) && !refs[1].match(/^(remote\/)*[^\/]+-.+-.+-.+$/)) {
			console.error(`Invalid stage name ${refs[1]}`);
			process.exit(1);
		}
		let stage: string = refs[1];
		let backref: number = parseInt(refs[3]);
		// let file: string = refs[4];
		let file: string = refs[5];
		if (refs[1] == 'remote/STAGE') {
			stage = 'remote/' + (await FileUtils.readStage(true));
		}
		if (refs[1] == 'STAGE' || refs[1] == 'HEAD') {
			stage = await FileUtils.readStage(true);
		}

		try {
			if (logs) {
				if (!hasfile) {
					throw new Error('Specify file for displaying logs');
				}
				if (refs[3].length >= 3) {
					const vvll = refs[3].length == 3 ? "0" + refs[3] : refs[3].substr(0, 4);
					const logs = await EdoCache.getLogsContent(stage, file, vvll);
					process.stdout.write(logs);
					process.exit(0);
				} else {
					const logs = await EdoCache.getLogs(stage, file);
					for (const line of Object.values(logs)) {
						console.log(line.join(' '));
					}
				}
			} else {
				const index: IEdoIndex = await EdoCache.getIndex(stage, backref);
				if (hasfile) {
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
				} else {
					console.log(`stage ${index.stgn}`);
					for (const item of Object.values(index.elem)) {
						console.log(item.join(' '));
					}
				}
			}

		} catch (err) {
			console.error("Error while running show!");
			console.error(err.message);
			process.exit(1);
		}
	}
}
