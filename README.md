# Edo - Endevor SCM CLI
Edo is scm tool for managing elements in Endevor SCM inventory on a local PC.

## description

Edo is used to provide similar user experience as git cli. It has basic commands implemented as decribed below.

To get list of commands and help run

`edo --help`

You can init repository from specific Endevor environment (accessed thru Endevor WebService).

`edo init http://host:port/EndevorService/rest/CONFIG`

Checkout specific subsystem/sandbox.

`edo checkout ENV-1-SYS-SUB`

In edo terminology, this is called stage and can be further refered as STAGE.
Edo database can have two stages (for one subsystem), remote and local.
Remote stage refers to the content which is located in Endevor.
Local stage refers to content which is on local PC and can be updated by user.

Fetch elements from Endevor to remote stage can be done this way.

`edo fetch`

After fetch, merge of the remote stage into his local stage should be done.

`edo merge`

To make work easier, use pull commnand to execute fetch and merge in one command.

`edo pull`

Edo doesn't have staging area as git. All the merging is done in working directory.

Therefore after each merge, execute commit to commit changes into his local stage.

`edo commit`

To check current status of working directory against local stage, run status. It also shows if there is any difference between local and remote stage (if fetch was run and wasn't merged, or if new files were introduced).

`edo status`

To update Endevor inventory, execute push command. Message is required for push, which is used as ccid and comment in Endevor. Ccid is first word in the message and if the word is longer than 12 character, it's truncated to 12.

`edo push -m 'ccid comment'`

## installation

Clone this git repository

`git clone https://github.com/dankox/endevor-cli.git`

With NPM, run install to get all the packages, build for compilation and link to make the command available for use in command line.

`npm install`

`npm run build`

`npm link`
