import * as request from "request";
import * as nodeurl from "url";
import http from "http";
import https from "https";
import * as zlib from "zlib";
import { IRestResponse } from "../doc/IRestResponse";
import { isNullOrUndefined } from "util";

/**
 * Endevor Rest API functions
 */
export class EndevorRestApi {
	public static getAuthHeader(cred64: string): any {
		const headers = {
			"Authorization": "Basic " + cred64
		};
		return headers;
	}


	public static async getRequest(url: string, headers: any): Promise<any> {
		// if (!headers['accept-encoding']) {
		// 	headers['accept-encoding'] = 'gzip,deflate';
		// }
		return new Promise<any>((resolve, reject) => {
			request.get({url: url, headers: headers},
				(err, response, body) => {
					if (err) {
						console.log(err);
						reject(err);
					} else {
						const responseJson = {
							status: response.statusCode,
							headers: response.headers,
							size: body.length,
							body: body
						};
						resolve(responseJson);
					}
				});
		});
	}

	/**
	 * Get HTTP request done thru nodejs http/https module which returns Promise (IRestResponse)
	 *
	 * This function automatically adds accept-encoding: gzip,deflate, and uncompress the response
	 * if obtained in one of those formats.
	 *
	 * @param url full URL which is requested (e.g.: http://localhost:8080/example/link)
	 * @param headers used in the request
	 */
	public static async getHttp(url: string, headers?: any): Promise<IRestResponse> {
		return new Promise<any>((resolve, reject) => {
			if (isNullOrUndefined(headers)) {
				headers = { "Accept": "application/json" };
			}
			const tUrl = nodeurl.parse(url);
			let client: any = http;
			if (!headers['accept-encoding']) {
				headers = {
					"accept-encoding": 'gzip,deflate',
					...headers
				};
			}
			const opts = {
				method: "GET",
				hostname: tUrl.hostname,
				port: tUrl.port,
				path: tUrl.path,
				rejectUnauthorized: false,
				headers: headers
			};
			if (tUrl.protocol === "https:") {
				client = https;
				// opts.rejectUnauthorized = false;
			}

			let data: Buffer[] = [];
			let size = 0;

			let thisRequest: http.ClientRequest = client.request(opts, (response: http.IncomingMessage) => {
				response.pause();
				let stream: http.IncomingMessage | zlib.Unzip = response;

				// if compressed, pipe it to uncompression function
				if (response.headers['content-encoding'] === 'gzip' || response.headers['content-encoding'] === 'deflate') {
					stream = zlib.createUnzip();
					response.pipe(stream);
				}

				stream.on('data', chunk => {
					data.push(chunk);
					size += chunk.length;
				});

				stream.on('end', () => {
					let responseJson: IRestResponse = {
						status: response.statusCode,
						headers: response.headers,
						size: size,
						body: null
					};
					if (response.headers['content-type'] == 'application/json') {
						responseJson.body = data.join('').toString();
					} else if (response.headers['content-type'] == 'application/octet-stream') {
						responseJson.body = Buffer.concat(data);
					} else {
						responseJson.body = data.join('');
					}

					resolve(responseJson);
					return;
				});

				stream.on('error', err => {
					thisRequest.abort();
					reject(err);
					return;
				});
				response.resume();
			});

			thisRequest.on('error', err => {
				reject(err);
			});
			thisRequest.end();
		});
	}
}
