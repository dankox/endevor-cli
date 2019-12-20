import read from "read";
import { isNullOrUndefined } from "util";
import { EndevorRestApi } from "./EndevorRestApi";


export class ConsoleUtils {
	public static readonly auth: string = "auth";
	public static readonly cLeft: string = "\x1b[D"; // left arrow

	public static readonly cBlack: string = "\x1b[0;30m";
	public static readonly cRed: string = "\x1b[0;31m";
	public static readonly cGreen: string = "\x1b[0;32m";
	public static readonly cYellow: string = "\x1b[0;33m";
	public static readonly cBlue: string = "\x1b[0;34m";
	public static readonly cPurple: string = "\x1b[0;35m";
	public static readonly cCyan: string = "\x1b[0;36m";
	public static readonly cGray: string = "\x1b[0;37m";

	public static readonly cDarkGrey: string = "\x1b[1;30m";
	public static readonly cLRed: string = "\x1b[1;31m";
	public static readonly cLGreen: string = "\x1b[1;32m";
	public static readonly cLYellow: string = "\x1b[1;33m";
	public static readonly cLBlue: string = "\x1b[1;34m";
	public static readonly cLPurple: string = "\x1b[1;35m";
	public static readonly cLCyan: string = "\x1b[1;36m";
	public static readonly cWhite: string = "\x1b[1;37m";

	public static readonly cReset: string = "\x1b[0m";

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
				ret.user = await ConsoleUtils.promptValue("username: ");
			} catch (err) {
				// console.error("Error while prompting for user name: " + err);
				throw new Error(err);
			}
		}
		if (isNullOrUndefined(pass)) {
			try {
				ret.pass = await ConsoleUtils.promptPassword("password: ");
			} catch (err) {
				// console.error("Error while prompting for password: " + err);
				throw new Error(err);
			}
		}
		return ret;
	}

	public static async verifyCredentials(repoURL: string, user: string | undefined, pass: string | undefined, count: number = 1): Promise<string> {
		// safeguard against blocking account
		if (count >= 3) {
			throw new Error("2 times failure, check your password and restart request!");
		}

		if (isNullOrUndefined(user) || user.length == 0) {
			try {
				user = await ConsoleUtils.promptValue("username: ");
			} catch (err) {
				throw new Error(err);
			}
		}
		if (isNullOrUndefined(pass) || pass.length == 0) {
			try {
				pass = await ConsoleUtils.promptPassword("password: ");
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
			console.log("connecting...");
			let response = await EndevorRestApi.getHttp(repoURL + ConsoleUtils.auth, headers);
			if (response.status != 200 && response.status != 206) {
				if (response.status == 401) {
					console.error("Invalid credentials!");
					return ConsoleUtils.verifyCredentials(repoURL, undefined, undefined, count + 1);
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