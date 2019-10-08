#!/usr/bin/env node

import { EdoInit } from './EdoInit';
import { EdoFetch } from './EdoFetch';
import { isNullOrUndefined } from 'util';


let argv : String[] = process.argv;

let $0 : String = argv[1];

// let i : number = 0;
// argv.forEach(element => {
// 	console.log(`${i} -> ${element}`);
// 	i++;
// });
for (let i = 0; i < argv.length; i++) {
	const element = argv[i];
	console.log(`${i} -> ${element}`);
}

if (!isNullOrUndefined(argv[2])) {
	if (argv[2] == "init") {
		// NdvInit.init(argv);
	} else if (argv[2] == "fetch") {
		// NdvFetch.fetch(argv);
	} else if (argv[2] == "pull") {
		// NdvFetch.fetch(argv);
	} else if (argv[2] == "checkout") {
		// NdvFetch.fetch(argv);
	}
}


console.log(argv);
