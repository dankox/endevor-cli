/**
 * Interface for settings
 * @export
 * @interface ISettings
 */
export interface ISettings {

	/** repo URL  */
	repoURL: string;
	/** credentials in base64 */
	cred64: string;
	/** instance */
	instance?: string | null;

}

