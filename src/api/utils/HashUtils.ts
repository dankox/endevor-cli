import crypto from "crypto";
import * as fs from "fs";
import { EdoCache } from "../EdoCache";

export class HashUtils {
	static readonly algo = 'sha1';

	public static isSha1(str: string) {
		return (str.match(/\b([a-f0-9]{40})\b/) != null);
	}

	public static getHash(buf: Buffer) {
		let hash = crypto.createHash(HashUtils.algo);
		hash.update(buf);
		return hash.digest('hex');
	}

	public static getHashType(buf: Buffer, type: string) {
		let hash = crypto.createHash(HashUtils.algo);
		const tmpBuf = EdoCache.createObjectBuffer(buf, type);
		hash.update(tmpBuf);
		return hash.digest('hex');
	}

	public static async getEdoFileHash(file: string) {
		return new Promise<string>((resolve, reject) => {
				fs.readFile(file, (error, buffer) => {
					if (error) {
						reject(error);
						return;
					}
					const sha1 = HashUtils.getHashType(buffer, EdoCache.OBJ_BLOB);
					resolve(sha1);
				});
		});
	}

	public static async getFileHash(file: string) {
		return new Promise<string>((resolve, reject) => {
			try {
				let hash = crypto.createHash(HashUtils.algo);
				const fileStream: fs.ReadStream = fs.createReadStream(file);
				fileStream.on("data", data => {
					hash.update(data);
				});
				fileStream.on("error", err => {
					reject(err);
				});
				fileStream.on("end", () => {
					resolve(hash.digest('hex'));
				});
			} catch (err) {
				reject(err);
			}
		});
	}
}
