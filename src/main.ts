#!/usr/bin/env node

import yargs from 'yargs';
import { EdoInit } from './EdoInit';
import { EdoFetch } from './EdoFetch';
import { EdoCheckout } from './EdoCheckout';
import { EdoPull } from './EdoPull';
import { EdoStatus } from './EdoStatus';

yargs.usage('Usage: $0 <command> [options]')
	.scriptName('edo')
	.command('init <url> [options]', 'Initialize local repo from remote url',
		EdoInit.edoInitOptions, EdoInit.init)
	.command('checkout <stage>', 'Checkout stage from local repo', EdoCheckout.edoCheckoutOptions, EdoCheckout.checkout)
	.command('fetch [options]', 'Fetch list of elements for local stage', EdoFetch.ndvFetchOptions, EdoFetch.fetch)
	// .showHelpOnFail(false)
	.help().demandCommand().argv;
