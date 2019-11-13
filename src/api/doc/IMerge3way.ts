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

