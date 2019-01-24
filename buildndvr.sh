#!/usr/bin/env bash
#
# buildndvr.sh filename [sandbox [comment]]
# - filename: element.type (where type can be an extension)
#              e.g. bc1pencr.asm -> BC1PENCR/ASMPGM
# - sandbox: sandbox in endevor (default DXKL)
# - comment: comment for update (default 'update')

#conversion array for extension => type
declare -A ext
ext=( ["ASM"]=ASMPGM ["MAC"]=ASMMAC ["C"]=CPGM ["CPP"]=CPGM ["H"]=CHDR )


filename=$1
sandbox=DXKL  # my default sandbox
if [ ! -z "$2" ]
  then
    sandbox=${2^^}
fi
comment="update"
if [ ! -z "$3" ]
  then
    comment=${3^^}
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
echo "build file: $filename => element: $element, type: $type, sandbox: $sandbox"

#endevor update element $element -i CMEWXY01 --env DEV --sys ESCM180 --sub $sandbox --type $type --ccid $sandbox --comment "$comment" --os --ff "$filename"
endevor generate element $element -i CMEWXY01 --env DEV --sn 1 --sys ESCM180 --sub $sandbox --type $type --ccid $sandbox --comment "$comment" --os --cb
#endevor list environments -i CMEWXY01


