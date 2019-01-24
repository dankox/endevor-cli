#!/usr/bin/env bash
#
# listndvr.sh [filename [sandbox]]
# - filename: element.type (where type can be an extension)
#              e.g. bc1pencr.asm -> BC1PENCR/ASMPGM
# - sandbox: sandbox in endevor (default DXKL)

#conversion array for extension => type
declare -A ext
ext=( ["ASM"]=ASMPGM ["MAC"]=ASMMAC ["C"]=CPGM ["CPP"]=CPGM ["H"]=CHDR )


filename=$1
sandbox=DXKL  # my default sandbox
if [ ! -z "$2" ]
  then
    sandbox=${2^^}
fi

echo "list file: $filename, sandbox: $sandbox"


if [ ! -z "$filename" ]
  then
    element="${filename%.*}"
    element=${element^^}

    extension="${filename##*.}"
    type=${ext[${extension^^}]}
    if [ -z "$type" ] # if extension not defined, just uppercase
    then
        type=${extension^^}
    fi

# run the endevor command (retrieve)
    endevor list elements "$element" -i CMEWXY01 --env DEV --sys ESCM180 --sub $sandbox --type $type --rfh
else
# run the endevor command (retrieve)
    endevor list elements \* -i CMEWXY01 --env DEV --sys ESCM180 --type \* --sub $sandbox --rfh
fi

#endevor list environments -i CMEWXY01


