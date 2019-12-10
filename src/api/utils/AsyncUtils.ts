import { isNullOrUndefined } from "util";
import { EndevorRestApi } from "./EndevorRestApi";
import readline from 'readline';

export class AsyncUtils {
	private static lastProgress: number = 0;

	public static async runHttpParallel(urls: string[], headers: any) {

		// for (let i = 0; i < 3; i++) {
		// 	const url = urls.pop();
		// 	if (isNullOrUndefined(url)) break;

		// 	EndevorRestApi.getHttp(url, headers);
		// }
		// for (const url of urls) {

		// }


	}

	/**
	 * Run promises in parallel (like: Promise.all) and allow to pass progress callback to
	 * see progress as each of the promise is resolved.
	 *
	 * Warning: DO NOT RUN MULTIPLE `promiseAll` IN PARALLEL!!! unforseens
	 *
	 * @param promises array of Promises
	 * @param cbProgress callback function which gets percentage of progress as parameter
	 */
	public static promiseAll(promises: Promise<any>[], cbProgress: (iter: number, max: number) => void) {
		let perc = 0;
		if (promises.length == 0) return Promise.all([]); // for no promises, do not call progress cb
		cbProgress(0, promises.length);
		for (const promise of promises) {
			promise.then(()=> {
				perc++;
				// cbProgress((perc * 100) / promises.length);
				cbProgress(perc, promises.length);
			});
		}
		return Promise.all(promises);
	}

	/**
	 * Progress bar function to display progress. It gets percantage and
	 * write `=` character for every tenth of total.
	 *
	 * @param iter current iteration of the progress
	 * @param max itteration for this progress
	 * @param total number of characters for progress bar (default `20`)
	 */
	public static progressBar(iter: number, max: number, total: number = 20) {
		if (total <= 0) total = 1;
		if (max == 0) return; // do not start for 0
		if (iter == 0) {
			process.stdout.write("[>");
			readline.moveCursor(process.stdout, -1, 0);
			return;
		}

		const cpi = Math.trunc((iter / max) * total); // characters per iteration
		for (let i = 0; i < cpi; i++) {
			process.stdout.write("=");
		}
		if (iter == max) {
			process.stdout.write("]\n");
		} else {
			process.stdout.write(">");
			readline.moveCursor(process.stdout, -(cpi + 1), 0);
		}
	}
}


