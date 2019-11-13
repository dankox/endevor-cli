import read from "read";
import { isNullOrUndefined } from "util";
import { EndevorRestApi } from "./EndevorRestApi";


export class ConsoleUtils {
	public static readonly auth: string = "auth";

	public static promptValue(prompt: string, defaultValue?: string): Promise<string> {
		let options = {
			prompt: prompt,
			default: defaultValue
		};
		return new Promise<string>((resolve, reject) => {
			read(options, (err, result) => {
				if (err) {
					return reject(err);
				}
				resolve(result);
			});
		});
	}

	public static promptPassword(prompt: string): Promise<string> {
		let options = {
			prompt: prompt,
			silent: true
		};
		return new Promise<string>((resolve, reject) => {
			read(options, (err, result) => {
				if (err) {
					return reject(err);
				}
				resolve(result);
			});
		});
	}

	public static async promptUserPass(user: string, pass: string): Promise<{user: string, pass: string}> {
		let ret = {
			user: user,
			pass: pass
		};
		if (isNullOrUndefined(user)) {
			try {
				ret.user = await this.promptValue("username: ");
			} catch (err) {
				// console.error("Error while prompting for user name: " + err);
				throw new Error(err);
			}
		}
		if (isNullOrUndefined(pass)) {
			try {
				ret.pass = await this.promptPassword("password: ");
			} catch (err) {
				// console.error("Error while prompting for password: " + err);
				throw new Error(err);
			}
		}
		return ret;
	}

	public static async verifyCredentials(repoURL: string, user: string | null | undefined, pass: string | null | undefined, count: number = 1): Promise<string> {
		// safeguard against blocking account
		if (count >= 3) {
			throw new Error("2 times failure, check you password and restart request!");
		}

		if (isNullOrUndefined(user)) {
			try {
				user = await this.promptValue("username: ");
			} catch (err) {
				throw new Error(err);
			}
		}
		if (isNullOrUndefined(pass)) {
			try {
				pass = await this.promptPassword("password: ");
			} catch (err) {
				throw new Error(err);
			}
		}

		let cred64 = Buffer.from(`${user}:${pass}`).toString("base64");
		let headers = EndevorRestApi.getAuthHeader(cred64);
		headers = {
			"Accept": "application/json",
			...headers
		};

		try {
			let response = await EndevorRestApi.getHttp(repoURL + ConsoleUtils.auth, headers);
			if (response.status != 200 && response.status != 206) {
				if (response.status == 401) {
					console.error("Invalid credentials!");
					return this.verifyCredentials(repoURL, null, null, count + 1);
				}
				// console.error(response);
				throw new Error("Credentials invalid!\n" + response.status);
			}
		} catch (err) {
			throw new Error("http request error: " + err);
		}
		// if everything passed, return credential string
		return cred64;
	}
}