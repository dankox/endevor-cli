#!/usr/bin/env bash

declare -A extToType
extToType=( ["ASM"]=ASMPGM ["MAC"]=ASMMAC ["C"]=CPGM ["CPP"]=CPGM ["H"]=CHDR )

#
# Setup for ndvr variables from branch name
# - first part of branch name is sandbox (until first non alphanumeric character)
# - rest from there (skipping the above char) is comment
# branchName => name of git branch (or default if not in git)
# sandbox => name of sandbox in endevor, used also as CCID
# comment => comment for endevor actions which needs it (- and _ replaced with space)
# extToType => map of extension to endevor type
function _setup_ndvr_vars() {
    local DEFAULT_BRANCH="DXK"

    if git rev-parse --git-dir > /dev/null 2>&1; then
        branchName=$(git rev-parse --abbrev-ref HEAD)
        echo "git directory: $branchName"
    else
        branchName=$DEFAULT_BRANCH
        echo "!NOT git directory: $branchName"
    fi

    sandbox=$(echo $branchName | sed -e 's/\([a-zA-Z0-9]\+\).*/\1/')
    #sandbox=${branchName:0:8}
    sandbox=${sandbox^^}

    comment=$(echo $branchName | sed -e 's/\([a-zA-Z0-9]\+\).\(.*\)/\2/')
    #comment=${branchName:9}
    comment=${comment//-/ }
    comment=${comment//_/ }

    if [ -z "$comment" ]
    then
        comment="Test update"
    fi

}

# _setup_ndvr_vars
# echo ${extToType[ASM]}

# echo $branchName
# echo $sandbox
# echo $comment


