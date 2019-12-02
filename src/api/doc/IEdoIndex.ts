/**
 * Interface for Edo index file
 */
export interface IEdoIndex {
	prev: string;
	stgn: string;
	mesg: string;
	type: string;
	elem: { [key: string]: string };
}
