import crypto from "crypto";
import * as fs from "fs";

export class HashUtils {
	static readonly algo = 'sha1';

	public static getHash(buf: Buffer) {
		let hash = crypto.createHash(HashUtils.algo);
		hash.update(buf);
		return hash.digest('hex');
	}

	public static getHashType(buf: Buffer, type: string) {
		let hash = crypto.createHash(HashUtils.algo);
		const prefixStr: string = type + ' ' + buf.length + '\n'; //??? 0x00
		const tmpBuf: Buffer = Buffer.alloc(Buffer.byteLength(prefixStr) + buf.length);
		Buffer.from(prefixStr).copy(tmpBuf);
		buf.copy(tmpBuf, Buffer.byteLength(prefixStr));
		hash.update(tmpBuf);
		return hash.digest('hex');
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