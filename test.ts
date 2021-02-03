// File for testing random stuff...

// let mystr: string = "Hello World\x00!";
console.log(require('path').normalize("./../../../"));

let mystr: string = "Hello World\0!";
console.log(mystr + "\n");
console.log(Buffer.from(mystr).toString('hex'));
let fileStr: string = "10393f2c8b 0 e40fcef14875aafd6723df408c7ce";
let tmp = fileStr.match(/\b([a-f0-9]{40})\b/);
console.log(tmp!=null);
if (tmp != null)
	console.log(tmp[0]);

var myStr = 'this$$is,a$test';
var newStr = myStr.replace(/\$/g, '__');
var newStr = newStr.replace(/_/g, '$');
console.log( newStr );  // "this-is-a-test"

let file = "hallo/";
if (file.match(/^[0-9A-Za-z]+\/.+$/)) {
	console.log('match!');
} else {
	console.log('DOES NOT MATCH!!!');
}

function addToArray(arr: string[]) {
	let items = ["??", "!!"];
	arr.push("???");
	arr.push.apply(arr, items);
	arr.push(...items);
}
function change2dArray(a2d: string[][]) {
	let items = ["??", "!!"];
	let tmp = a2d[0];
	tmp[0] = "zdar";
	tmp[2] = "?";
	a2d[1][1] = "pico";
	a2d.push(items);
}
let tstArAr: string[][] = [ [ "ahoj", "vole"], ["jak", "je"], ["cajk"] ];
console.log(tstArAr);
change2dArray(tstArAr);
console.log(tstArAr);


let tstArr: string[] = [ "ahoj", "vole", "jak", "je" ];
console.log(tstArr);
addToArray(tstArr);
console.log(tstArr);

require('fs').readdir('./.edo', function (err: any, files: any) {
    //handling error
    if (err) {
        return console.log('Unable to scan directory: ' + err);
    }
    //listing all files using forEach
    files.forEach(function (file: any) {
        // Do whatever you want to do with the file
        console.log(file);
    });
});

function testTry(): string {
	let ret = "hello";
	try {
		console.log('try');
		return ret;
	} finally {
		console.log('final');
		ret = "world";
	}
}
console.log(testTry());