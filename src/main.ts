#!/usr/bin/env node

import yargs from 'yargs';
import { EdoInit } from './cli/EdoInit';
import { EdoCheckout } from './cli/EdoCheckout';
import { EdoFetch } from './cli/EdoFetch';
import { EdoMerge } from './cli/EdoMerge';
import { EdoPull } from './cli/EdoPull';
import { EdoStatus } from './EdoStatus';
import { EdoDiscard } from './cli/EdoDiscard';
import { EdoCommit } from './EdoCommit';
import { EdoDiff } from './EdoDiff';
import { EdoDifftool } from './EdoDifftool';
import { EdoPush } from './EdoPush';
import { EdoCatFile } from './cli/EdoCatFile';

yargs.usage('Usage: $0 <command> [options]')
	.scriptName('edo')
	.command('init <url> [options]', 'Initialize local repo from remote url',
		EdoInit.edoInitOptions, EdoInit.process)
	.command('checkout <stage>', 'Checkout stage from local repo', EdoCheckout.edoCheckoutOptions, EdoCheckout.process)
	.command('fetch [options] [files..]', 'Fetch elements from remote repo to remote stage', EdoFetch.edoFetchOptions, EdoFetch.process)
	.command('merge [files..]', 'Merge files from remote to local stage', EdoMerge.edoMergeOptions, EdoMerge.process)
	.command('pull [stage] [files..]', 'Fetch elements and merge them to local stage', EdoPull.edoPullOptions, EdoPull.process)
	.command('push [file] [options]', 'Push elements from local stage to remote stage', EdoPush.edoPushOptions, EdoPush.push)
	.command('status', 'Show the working tree status', {}, EdoStatus.status)
	.command('commit [file]', 'Commit working directory to local stage', EdoCommit.edoCommitOptions, EdoCommit.commit)
	.command('discard [file]', 'Discard changes in working directory', EdoDiscard.edoDiscardOptions, EdoDiscard.process)
	.command('diff [file] [options]', 'Diff working directory against local stage, or remote, etc.', EdoDiff.edoDiffOptions, EdoDiff.diff)
	.command('difftool [file] [options]', 'Use difftool to diff files in working directory against local stage, or remote, etc.', EdoDifftool.edoDifftoolOptions, EdoDifftool.difftool)
	.command('cat-file [file]', 'cat database file specified by sha1 identifier', EdoCatFile.edoCatOptions, EdoCatFile.process)
	// .showHelpOnFail(false)
	.help().demandCommand().argv;
