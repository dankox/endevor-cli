/**
 * Interface for Edo index file
 */
export interface IEdoIndex {
	prev: string;
	stgn: string;
	type: string;
	elem: { [key: string]: string };
}
