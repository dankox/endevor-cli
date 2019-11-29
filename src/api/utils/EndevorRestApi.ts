import FormData from "form-data";
import * as fs from "fs";
import * as nodeurl from "url";
import http from "http";
import https from "https";
import * as zlib from "zlib";
import { IRestResponse } from "../doc/IRestResponse";
import { isNullOrUndefined } from "util";
import { ISettings } from "../../doc/ISettings";

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

	public static getJsonHeader(config: ISettings): any {
		const headers = {
			"Accept": "application/json",
			...EndevorRestApi.getAuthHeader(config.cred64)
		};
		return headers;
	}

	/**
	 * GET HTTP request done thru nodejs http/https module which returns Promise (IRestResponse)
	 *
	 * @param url full URL which is requested (e.g.: http://localhost:8080/example/link)
	 * @param headers used in the request
	 */
	public static async getHttp(url: string, headers?: any): Promise<IRestResponse> {
		return new Promise<any>((resolve, reject) => {
			const opts = {
				method: "GET",
				headers: headers
			};
			let thisRequest = this.httpRequest(url, opts, resolve, reject);
			thisRequest.on('error', err => {
				reject(err);
			});
			thisRequest.end();
		});
	}

	/**
	 * PUT HTTP request done thru nodejs http/https module which returns Promise (IRestResponse)
	 *
	 * This function creates multipart/form-data request and sends it to endpoint.
	 *
	 * @param url full URL which is requested (e.g.: http://localhost:8080/example/link)
	 * @param file full path to file which should be uploaded
	 * @param ccid for add file
	 * @param comment for add file
	 * @param headers used in the request
	 */
	public static async addElementHttp(url: string, file: string, ccid: string, comment: string, fingerprint: string, headers: any): Promise<IRestResponse> {
		return new Promise<IRestResponse>((resolve, reject) => {
			let addForm = new FormData();
			addForm.append("ccid", ccid);
			addForm.append("comment", comment);
			addForm.append("fingerprint", fingerprint);
			addForm.append("fromFile", fs.createReadStream(file));
			addForm.append("oveSign", "yes"); // TODO: maybe do option on this????
			headers = {
				...addForm.getHeaders(),
				...headers
			};
			const opts = {
				method: "PUT",
				rejectUnauthorized: false,
				headers: headers
			};

			let thisRequest = this.httpRequest(url, opts, resolve, reject);
			addForm.pipe(thisRequest);
		});
	}

	/**
	 * Create ClientRequest for specific URL and options and assign on response listener.
	 *
	 * This function automatically adds accept-encoding: gzip,deflate, and uncompress the response
	 * if obtained in one of those formats.
	 *
	 * It also adds accept: application/json if no header is specified.
	 *
	 * @param url full URL requested
	 * @param options http options
	 * @param resolve Promise function resolve
	 * @param reject Promise function reject
	 */
	public static httpRequest(url: string, options: http.RequestOptions | https.RequestOptions, resolve: any, reject: any): http.ClientRequest {
		let headers = options.headers;
		if (isNullOrUndefined(headers)) {
			headers = { "Accept": "application/json" };
		}
		const tUrl = nodeurl.parse(url);
		let client: typeof http | typeof https = http;
		if (!headers['accept-encoding']) {
			headers = {
				"accept-encoding": 'gzip,deflate',
				...headers
			};
		}
		options.headers = headers;
		const opts: http.RequestOptions | https.RequestOptions = {
			hostname: tUrl.hostname,
			port: tUrl.port,
			path: tUrl.path,
			rejectUnauthorized: false, // TODO: option?
			...options
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
					responseJson.body = Buffer.concat(data).toString(); // data.join('').toString();
				} else if (response.headers['content-type'] == 'application/octet-stream') {
					responseJson.body = Buffer.concat(data);
				} else if (response.headers['content-type'] == 'text/plain') {
					responseJson.body = Buffer.concat(data).toString();
				} else {
					responseJson.body = Buffer.concat(data); // data.join('');
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

		thisRequest.on('abort', (err: any) => {
			reject(err);
		});

		thisRequest.on('error', err => {
			reject(err);
		});

		return thisRequest;
	}
}
