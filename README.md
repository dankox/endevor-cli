# endevor-cli
Endevor CLI for basic manipulation with elements in sandbox environment

## description

Endevor CLI short command 'edo' is used to provide similar user experience as git cli.

To get list of commands and help run

`edo --help`

You can init repository from specific Endevor environment (accessed thru Endevor WebService).

`edo init http://host:port/EndevorService/rest/CONFIG`

Checkout specific subsystem/sandbox

`edo checkout ENV-1-SYS-SUB`

Fetch list of elements

`edo fetch`

Pull elements from remote repository (Endevor environment)

`edo pull`

Check status, changes against local, remote repo

`edo status`

Commit to local repository

`edo commit`

Push to remote repository (Endevor environment) [NOT IMPLEMENTED YET!!!]

`edo push`

## installation

Clone the git repository

`git clone https://github.com/dankox/endevor-cli.git`

With NPM install and link to your path

`npm install`

`npm run build`

`npm link`
