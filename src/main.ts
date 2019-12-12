#!/usr/bin/env node

import yargs from 'yargs';
import { EdoInit } from './cli/EdoInit';
import { EdoCheckout } from './cli/EdoCheckout';
import { EdoDiscard } from './cli/EdoDiscard';
import { EdoFetch } from './cli/EdoFetch';
import { EdoMerge } from './cli/EdoMerge';
import { EdoPull } from './cli/EdoPull';
import { EdoDiff } from './cli/EdoDiff';
import { EdoStatus } from './cli/EdoStatus';
import { EdoCatFile } from './cli/EdoCatFile';
import { EdoDifftool } from './EdoDifftool';
import { EdoCommit } from './EdoCommit';
import { EdoPush } from './EdoPush';

yargs.usage('Usage: $0 <command> [options]')
	.scriptName('edo')
	.command('init <url> [options]', 'Initialize local repo from remote url',
		EdoInit.edoInitOptions, EdoInit.process)
	.command('checkout <stage>', 'Checkout stage from local repo', EdoCheckout.edoCheckoutOptions, EdoCheckout.process)
	.command('fetch [options] [files..]', 'Fetch elements from remote repo to remote stage', EdoFetch.edoFetchOptions, EdoFetch.process)
	.command('merge [files..]', 'Merge files from remote to local stage', EdoMerge.edoMergeOptions, EdoMerge.process)
	.command('pull [stage] [files..]', 'Fetch elements and merge them to local stage', EdoPull.edoPullOptions, EdoPull.process)
	.command('push [file] [options]', 'Push elements from local stage to remote stage', EdoPush.edoPushOptions, EdoPush.push)
	.command('status [options] [stage]', 'Show the working tree status', EdoStatus.edoStatusOptions, EdoStatus.process)
	.command('commit [file]', 'Commit working directory to local stage', EdoCommit.edoCommitOptions, EdoCommit.commit)
	.command('restore [files..]', 'Discard changes in working directory', EdoDiscard.edoDiscardOptions, EdoDiscard.process) // because I always mixed them :)
	.command('discard [files..]', 'Discard changes in working directory', EdoDiscard.edoDiscardOptions, EdoDiscard.process)
	.command('diff [file] [options]', 'Diff working directory against local stage, or remote, etc.', EdoDiff.edoDiffOptions, EdoDiff.process)
	.command('difftool [file] [options]', 'Use difftool to diff files in working directory against local stage, or remote, etc.', EdoDifftool.edoDifftoolOptions, EdoDifftool.difftool)
	.command('cat-file [file]', 'cat database file specified by sha1 identifier', EdoCatFile.edoCatOptions, EdoCatFile.process)
	// .showHelpOnFail(false)
	.help().demandCommand().argv;
