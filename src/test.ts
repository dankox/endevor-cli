#!/usr/bin/env node


let argv: String[] = process.argv;

let $0: String = argv[1];

// let i : number = 0;
// argv.forEach(element => {
// 	console.log(`${i} -> ${element}`);
// 	i++;
// });
for (let i = 0; i < argv.length; i++) {
	const element = argv[i];
	console.log(`${i} -> ${element}`);
}

if (argv[2] != null) {
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
