#!/usr/bin/env bash
#
# getndvr.sh filename [sandbox]
# - filename: element.type (where type can be an extension)
#              e.g. bc1pencr.asm -> BC1PENCR/ASMPGM
# - sandbox: sandbox in endevor (default DXKL)

# provide $extToType[] array for mapping extension to type
. ./ndvrutils.sh

#setup variables $branchName, $sandbox, $comment
_setup_ndvr_vars

# if defined parameter -> it's sandbox to pull from
if [ ! -z "$1" ]
  then
    sandbox=${1^^}
fi

endevor list elements \* -i CMEWXY01 --env DEV --sys ESCM180 --type \* --sub $sandbox --sm --rft list --rff fullElmName typeName sbsName > list.json
cat list.json | ./pullndvr.py


# element="${filename%.*}"
# element=${element^^}

# extension="${filename##*.}"
# type=${ext[${extension^^}]}
# if [ -z "$type" ] # if extension not defined, just uppercase
#   then
#     type=${extension^^}
# fi

# # run the endevor command (retrieve)
# echo "get file: $filename => element: $element, type: $type, sandbox: $sandbox"

# endevor view element $element -i CMEWXY01 --env DEV --sn 1 --sys ESCM180 --sub $sandbox --type $type --tf "$filename" --search
# #endevor list environments -i CMEWXY01


