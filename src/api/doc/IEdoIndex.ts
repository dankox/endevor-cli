/**
 * Interface for Edo index file
 */
export interface IEdoIndex {
	prev: string;
	stgn: string;
	stat: string;
	mesg: string;
	type: string;
	elem: { [key: string]: string[] };
}

/**
 * EdoIndex class for easier implementing of index
 */
export class EdoIndex {
	static readonly STAT_UPDATED: string = 'updated';
	static readonly STAT_FETCHED: string = 'fetched';

	/**
	 * Create empty EdoIndex with stage name specified.
	 *
	 * @param stage name
	 */
	public static init(stage: string): IEdoIndex {
		return {
			prev: 'null',
			stgn: stage,
			stat: '',
			mesg: '',
			type: '',
			elem: {}
		};
	}
}

