import * as diff from "diff";
// import { IMerge3way } from "../doc/IMerge3way";
import { isNullOrUndefined } from "util";
import { FileUtils } from "./FileUtils";
import { IEdoIndex } from "../doc/IEdoIndex";
import { EdoCache } from "../EdoCache";
import { HashUtils } from "./HashUtils";

/**
 * Interface for arguments to 3-way merge function
 */
export interface IMerge3way {
	base: string;
	mine: string;
	mineName?: string;
	theirs: string;
	theirsName?: string;
}

/**
 * Interface for returned object from 3-way merge
 */
export interface IMergedResult {
	status: string;
	buffer: Buffer;
}

/**
 * Endevor merge functionality
 */
export class MergeUtils {
	static readonly STATUS_UP2DATE: string = "up2date";
	static readonly STATUS_MERGED: string = "merged";
	static readonly STATUS_CONFLICT: string = "conflict";
	static readonly STATUS_DELETED: string = "deleted";

	/**
	 * Merge 3 Buffers where one is base and other 2 are changes.
	 * Buffers are translated to strings and trailing spaces on lines are trimmed.
	 *
	 * @param baseBuf base buffer
	 * @param localBuf local buffer
	 * @param remoteBuf remote buffer
	 */
	public static merge3bufs(baseBuf: Buffer, localBuf: Buffer, remoteBuf: Buffer): IMergedResult {
		let trimTrailingSpace = true;
		let baseStr = baseBuf.toString();
		let mineStr = localBuf.toString();
		let theirsStr = remoteBuf.toString();

		// trim trailling space if required
		if (trimTrailingSpace) {
			baseStr = MergeUtils.trimTrailSpace(baseStr);
			mineStr = MergeUtils.trimTrailSpace(mineStr);
			theirsStr = MergeUtils.trimTrailSpace(theirsStr);
		}

		if (mineStr == baseStr) {
			// no local change => return remote
			return { status: MergeUtils.STATUS_MERGED, buffer: remoteBuf };
		}
		const mergearg: IMerge3way = {
			base: baseStr,
			mine: mineStr,
			theirs: theirsStr
		};
		let merged: string[] = MergeUtils.merge3way(mergearg);
		let isOk = merged.shift();
		// it's just safe check, shouldn't happen
		if (isNullOrUndefined(isOk)) isOk = MergeUtils.STATUS_CONFLICT;

		// TODO: check the line endings, last line is not merged properly (last empty line)
		let tmpBuf: Buffer = Buffer.from(merged.join('\n'));

		return { status: isOk, buffer: tmpBuf };
	}

	/**
	 * Three way merge which produces array with lines for final merged/conflicted file.
	 *
	 * @param argv object containing base, mine and theirs input
	 * @return {string[]} array
	 */
	public static merge3way(argv: IMerge3way, trimTrailingSpace: boolean = false): string[] {
		let base = argv.base;
		let mine = argv.mine;
		let theirs = argv.theirs;
		// trim trailling space if required
		if (trimTrailingSpace) {
			base = MergeUtils.trimTrailSpace(base);
			mine = MergeUtils.trimTrailSpace(mine);
			theirs = MergeUtils.trimTrailSpace(theirs);
		}

		let mineName = "LOCAL";
		if (argv.mineName) mineName = argv.mineName;
		let theirsName = "REMOTE";
		if (argv.theirsName) theirsName = argv.theirsName;

		// run 3 way merge
		let parse = diff.merge(mine, theirs, base);
		let baseArr: string[] = base.split('\n');
		let baseIdx: number = 1;

		let output: string[] = [];
		let conflicta: string[] = [];
		let conflictb: string[] = [];
		// let conflictbase: string[] = []; // this doesn't currently work well...
		let conflict: boolean = false;
		let finalConflict: boolean = false;
		let enda: boolean = false;
		let endb: boolean = false;

		// go thru each hunk and check for conflicts (hunk.conflict)
		parse.hunks.forEach((hunk: any) => {
			conflict = false;
			// handle beginnig of the hunk
			if (!isNullOrUndefined(hunk.oldStart)) {
				// copy lines infront of the hunk if required
				if (hunk.oldStart > baseIdx) {
					for (let i = baseIdx; i < hunk.oldStart; i++) {
						output.push(baseArr[i - 1]);
					}
				}
				// move base index
				if (!isNullOrUndefined(hunk.oldLines)) {
					baseIdx = hunk.oldStart + hunk.oldLines;
				}
			}
			hunk.lines.forEach((line: any) => {
				// line without conflict
				if (typeof line == 'string')  {
					// if mine and theirs didn't end yet
					if (!enda && !endb) {
						// if conflict, create git-like merge output
						if (conflict) {
							conflict = false;
							output.push("<<<<<<< " + mineName);
							output.push(...conflicta);
							// output.push("|||||||");
							// output.push(...conflictbase);
							output.push("=======");
							output.push(...conflictb);
							output.push(">>>>>>> " + theirsName);
							conflicta = [];
							conflictb = [];
							// conflictbase = [];
						}
						if (line[0] != '-' && line[0] != '\\') {
							output.push(line.slice(1)); // push to output '+' and ' '
						}
					} else if (enda) { // if mine ends push to theirs lines
						if (line[0] != '-' && line[0] != '\\') { // only '+' and ' '
							conflictb.push(line.slice(1));
						}
					} else if (endb) { // if theirs ends push to mine lines
						if (line[0] != '-' && line[0] != '\\') { // only '+' and ' '
							conflicta.push(line.slice(1));
						}
					}
				} else { // handle line with conflicts
					if (line.conflict) {
						conflict = true;
						finalConflict = true;
						line.mine.forEach((la: string) => {
							if (la[0] != '-' && la[0] != '\\') {
								conflicta.push(la.slice(1)); // push to mine conflicts '+' or ' '
							// } else if (la[0] == '-') {
							// 	conflictbase.push(la.slice(1));
							} else if (la[0] == '\\') {
								enda = true; // set end of mine input for
							}

						});
						line.theirs.forEach((lb: string) => {
							if (lb[0] != '-' && lb[0] != '\\') {
								conflictb.push(lb.slice(1)); // push to theirs conflicts '+' or ' '
							// } else if (lb[0] == '-') {
							// 	if (conflictbase.indexOf(lb.slice(1)) == -1) {
							// 		conflictbase.push(lb.slice(1));
							// 	}
							} else if (lb[0] == '\\') {
								endb = true; // set end of theirs input for
							}
						});
					} else {
						// This shouldn't happened (it's either string or conflict object)
						console.error("No conflict??? Shouldn't happened... uncaught stuff: " + line.toString());
					}
				}
			});
			// resolve final conflict if there is still some
			if (conflict) {
				// walk from back conflicting arrays and check if they have common lines
				let nonconflict: string[] = [];
				let minlen = Math.min(conflicta.length, conflictb.length);
				let idxa = conflicta.length - 1;
				let idxb = conflictb.length - 1;
				for (let i = 0; i < minlen; i++) {
					idxa -= i;
					idxb -= i;
					// for common lines, push to non-conflicting array
					if (conflicta[idxa] == conflictb[idxb]) {
						nonconflict.push(conflicta[idxa]);
					} else {
						break;
					}
				}
				output.push("<<<<<<< " + mineName);
				output.push(...conflicta.slice(0, idxa + 1)); // push in only conflicting
				// output.push("|||||||");
				// output.push(...conflictbase);
				output.push("=======");
				output.push(...conflictb.slice(0, idxb + 1)); // push in only conflicting
				output.push(">>>>>>> " + theirsName);
				if (nonconflict.length > 0) // push non-conflicting at the end
					output.push(...nonconflict.reverse());
			}
		});

		// handle remaining of the file (if hunk doesn't cover it)
		if (baseIdx <= baseArr.length) {
			for (let i = baseIdx; i <= baseArr.length; i++) {
				output.push(baseArr[i - 1]);
			}
		}
		if (finalConflict) {
			output.unshift(MergeUtils.STATUS_CONFLICT);
		} else {
			output.unshift(MergeUtils.STATUS_MERGED);
		}
		return output;
	}

	/**
	 * Helper function for trimming trailing spaces in string .
	 * It divides the string by new lines `\n` and trim trailing
	 * space on the end of lines.
	 *
	 * @param input string (from reading file or so)
	 * @returns string without trailing spaces
	 */
	public static trimTrailSpace(input: string): string {
		let tmpLines: string[] = input.split('\n');
		let output: string[] = [];
		for (let line of tmpLines) {
			output.push(line.trimRight());
		}
		return output.join('\n');
	}

}

// Test
// async function test() {
// 	let trimTrailingSpace = true;
// 	const baseStr = (await fu.readfile(`../test/cli-test-2/.endevor/map/DEV-1-ESCM180-DXKL/remote/1281d60fc2636b8df44696aad18e05e5d72fc670`, trimTrailingSpace)).toString();
// 	// let baseStr = (await fu.readfile(`../test/cli-test-2/.endevor/map/DEV-1-ESCM180-DXKL/remote/6be16d3aad833c0e887e13ac2b24e9ca1044dc72`, trimTrailingSpace)).toString();
// 	const mine = (await fu.readfile(`../test/cli-test-2/.endevor/map/DEV-1-ESCM180-DXKL/remote/6be16d3aad833c0e887e13ac2b24e9ca1044dc72`, trimTrailingSpace)).toString();
// 	// const mineStr = (await fu.readfile('../test/cli-test-2/.endevor/map/DEV-1-ESCM180-DXKL/remote/1281d60fc2636b8df44696aad18e05e5d72fc670', trimTrailingSpace)).toString();
// 	// const mineStr = '';
// 	const theirsStr = (await fu.readfile(`../test/cli-test-2/.endevor/map/DEV-1-ESCM180-DXKL/remote/60a7828196ffa396a4a80eff42bf9b2fd590ed6a`, trimTrailingSpace)).toString();
// 	console.log(EdoMerge.merge3way({ base: baseStr, mine: mineStr, theirs: theirsStr }).join('\n'));
// }

// test();
