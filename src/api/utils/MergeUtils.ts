import { diff3Merge } from "node-diff3";
// import { IMerge3way } from "../doc/IMerge3way";
// import { FileUtils } from "./FileUtils";
// import { IEdoIndex } from "../doc/IEdoIndex";
// import { EdoCache } from "../EdoCache";
// import { HashUtils } from "./HashUtils";

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
		if (isOk == null) isOk = MergeUtils.STATUS_CONFLICT;

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
		if (trimTrailingSpace) {
			base = MergeUtils.trimTrailSpace(base);
			mine = MergeUtils.trimTrailSpace(mine);
			theirs = MergeUtils.trimTrailSpace(theirs);
		}

		let mineName = "LOCAL";
		if (argv.mineName) mineName = argv.mineName;
		let theirsName = "REMOTE";
		if (argv.theirsName) theirsName = argv.theirsName;

		const mineLines = mine.split('\n');
		const baseLines = base.split('\n');
		const theirsLines = theirs.split('\n');

		const regions = diff3Merge(mineLines, baseLines, theirsLines);

		let output: string[] = [];
		let finalConflict: boolean = false;

		for (const region of regions) {
			if (region.ok) {
				output.push(...region.ok);
			} else if (region.conflict) {
				finalConflict = true;
				output.push("<<<<<<< " + mineName);
				output.push(...region.conflict.a);
				output.push("=======");
				output.push(...region.conflict.b);
				output.push(">>>>>>> " + theirsName);
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
