#!/usr/bin/env node

import yargs from 'yargs';
import { EdoInit } from './EdoInit';
import { EdoFetch } from './EdoFetch';
import { EdoCheckout } from './EdoCheckout';
import { EdoPull } from './EdoPull';
import { EdoStatus } from './EdoStatus';
import { EdoRestore } from './EdoRestore';
import { EdoCommit } from './EdoCommit';
import { EdoDiff } from './EdoDiff';
import { EdoDifftool } from './EdoDifftool';

yargs.usage('Usage: $0 <command> [options]')
	.scriptName('edo')
	.command('init <url> [options]', 'Initialize local repo from remote url',
		EdoInit.edoInitOptions, EdoInit.init)
	.command('checkout <stage>', 'Checkout stage from local repo', EdoCheckout.edoCheckoutOptions, EdoCheckout.checkout)
	.command('fetch [options]', 'Fetch list of elements for local stage', EdoFetch.ndvFetchOptions, EdoFetch.fetch)
	.command('pull [file]', 'Get elements from the list to local stage', EdoPull.edoPullOptions, EdoPull.pull)
	.command('status', 'Show the working tree status', {}, EdoStatus.status)
	.command('commit [file]', 'Commit working directory to local stage', EdoCommit.edoCommitOptions, EdoCommit.commit)
	.command('restore [file]', 'Restore files in working directory', EdoRestore.edoRestoreOptions, EdoRestore.restore)
	.command('diff [file] [options]', 'Diff working directory against local stage, or remote, etc.', EdoDiff.edoDiffOptions, EdoDiff.diff)
	.command('difftool [file] [options]', 'Use difftool to diff files in working directory against local stage, or remote, etc.', EdoDifftool.edoDifftoolOptions, EdoDifftool.difftool)
	// .showHelpOnFail(false)
	.help().demandCommand().argv;
