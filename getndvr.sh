#!/usr/bin/env bash
#
# getndvr.sh filename [sandbox]
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

element="${filename%.*}"
element=${element^^}

extension="${filename##*.}"
type=${ext[${extension^^}]}
if [ -z "$type" ] # if extension not defined, just uppercase
  then
    type=${extension^^}
fi

# run the endevor command (retrieve)
echo "get file: $filename => element: $element, type: $type, sandbox: $sandbox"

endevor view element $element -i CMEWXY01 --env DEV --sn 1 --sys ESCM180 --sub $sandbox --type $type --tf "$filename" --search
#endevor list environments -i CMEWXY01


