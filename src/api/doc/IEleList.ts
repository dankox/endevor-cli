/**
 * Element list information
 */
export interface IEleList {
	typeName: string;
	fileExt: string | null;
	fingerprint: any;
	fullElmName: string;
	elmVVLL: string;
	baseVVLL: string;
	sha1?: string;
}
// ${ele.typeName},${ele.fileExt},${ele.fingerprint},sha1,${ele.fullElmName}