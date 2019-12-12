import readline from 'readline';
import { ConsoleUtils } from './ConsoleUtils';

export class AsyncUtils {
	private static lastProgress: number = 0;
	private static fullProgress: number = 0;
	public static progressCycleIndex = 0;
	public static progressCycleColor = ConsoleUtils.cCyan;
	public static progressCycle: string[] = [
		"=>]>=", // ǁ =>]|]>=
		"-/|\\",
		">|<-",
		" +x*",
		"-=≡",
		"⠁⠂⠄⠂",
		" .oO°Oo.",
		"⠁⠂⠄⡀⢀⠠⠐⠈",
		"▁ ▂ ▃ ▄ ▅ ▆ ▇ █ ▇ ▆ ▅ ▄ ▃ ▁",
		"⣾⣽⣻⢿⡿⣟⣯⣷",
		"⡀⡁⡂⡃⡄⡅⡆⡇⡈⡉⡊⡋⡌⡍⡎⡏⡐⡑⡒⡓⡔⡕⡖⡗⡘⡙⡚⡛⡜⡝⡞⡟⡠⡡⡢⡣⡤⡥⡦⡧⡨⡩⡪⡫⡬⡭⡮⡯⡰⡱⡲⡳⡴⡵⡶⡷⡸⡹⡺⡻⡼⡽⡾⡿⢀⢁⢂⢃⢄⢅⢆⢇⢈⢉⢊⢋⢌⢍⢎⢏⢐⢑⢒⢓⢔⢕⢖⢗⢘⢙⢚⢛⢜⢝⢞⢟⢠⢡⢢⢣⢤⢥⢦⢧⢨⢩⢪⢫⢬⢭⢮⢯⢰⢱⢲⢳⢴⢵⢶⢷⢸⢹⢺⢻⢼⢽⢾⢿⣀⣁⣂⣃⣄⣅⣆⣇⣈⣉⣊⣋⣌⣍⣎⣏⣐⣑⣒⣓⣔⣕⣖⣗⣘⣙⣚⣛⣜⣝⣞⣟⣠⣡⣢⣣⣤⣥⣦⣧⣨⣩⣪⣫⣬⣭⣮⣯⣰⣱⣲⣳⣴⣵⣶⣷⣸⣹⣺⣻⣼⣽⣾⣿",
	];

	public static progressTimer: number = 250;

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
		let perc: number = 0;
		AsyncUtils.fullProgress = promises.length;

		if (promises.length == 0) return Promise.all([]); // for no promises, do not call progress cb
		cbProgress(0, promises.length);
		AsyncUtils.progressIcon(0, AsyncUtils.progressCycle[AsyncUtils.progressCycleIndex]);
		for (const promise of promises) {
			promise.then(()=> {
				perc++;
				AsyncUtils.lastProgress = perc;
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
		process.stdout.write(ConsoleUtils.cReset);
		if (iter == 0) {
			process.stdout.write("[ ");
			return;
		}

		const cpi = Math.trunc((iter / max) * total); // characters per iteration
		const pcpi = Math.trunc(( (iter-1) / max) * total); // characters per iteration
		readline.moveCursor(process.stdout, -(pcpi + 1), 0); // with +1 because of progress pattern
		for (let i = 0; i < cpi; i++) {
			process.stdout.write("=");
		}
		if (iter == max) {
			process.stdout.write("]\n");
		} else {
			process.stdout.write(" "); // for the progressIcon cursor move
		}
	}

	/**
	 * Progress cycle character to show that application is in progress.
	 *
	 * Internally used in `AsyncUtils.promiseAll()` to show progress.
	 *
	 * @param currentProgress index which character from `pattern` should show
	 * @param pattern with characters which progress should cycle thru
	 */
	public static progressIcon(currentProgress: number, pattern: string) {
		setTimeout(() => {
			// when progress finished
			if (AsyncUtils.lastProgress == AsyncUtils.fullProgress) return;

			// cycle thru pattern and display
			readline.moveCursor(process.stdout, -1, 0);
			if (currentProgress >= pattern.length) currentProgress = 0;
			const char = pattern[currentProgress];
			process.stdout.write(AsyncUtils.progressCycleColor + char);
			// call again next time with increased progress
			AsyncUtils.progressIcon(++currentProgress, pattern);
		}, AsyncUtils.progressTimer);
	}

}


