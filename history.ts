import * as fs from 'fs';

function createFileFromHistory(histFile: string, vvll: string) {
	fs.readFile(histFile, (error, buffer) => {
		if (error) {
			console.error("Error reading file: " + error);
			return 'read-error';
		}
		let lines: string[] = buffer.toString().split('\n');
		let output: string[] = [];
		let changeDetail: string = '';
		let foundDetail: boolean = false;
		for (let line of lines) {
			if (!foundDetail && line[2] == ' ') {
				if (line.slice(3, 7) == vvll) {
					foundDetail = true;
					changeDetail = line.slice(13);
				}
			} else if (line[2] == '+') {
				if (line.slice(3, 7) > vvll) continue;
				if (line[7] == '-' && line.slice(8, 12) <= vvll) continue;
				output.push(line.slice(13));
				// output.push(line.trimRight());
			}
		}
		fs.writeFile(histFile + "." + vvll, Buffer.from(output.join('\n')), error => {
			if (error) {
				console.error("Error writing file: " + error);
				return 'write-error';
			}
			console.log(histFile + "." + vvll + ": " + changeDetail);
		});
	});


}

const file = 'bc1pserv.asmpgm.lst';
const oldvvll = '0202';
const newvvll = '0203';
// createFileFromHistory(file, newvvll);
createFileFromHistory(file, '0170');
createFileFromHistory(file, '0171');
createFileFromHistory(file, '0172');
createFileFromHistory(file, '0173');