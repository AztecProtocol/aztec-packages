#!/usr/bin/env bash
# Usage: rename_private_symbols.sh <llvm-nm> <llvm-objcopy> <ar> <out.a> <objects.rsp> <export>...
#
# Archives the objects listed in <objects.rsp> (one per line) into <out.a> with every symbol they
# define renamed under a private prefix, except the <export>s and the replaceable operator new and
# delete. A consumer's own C++ (its msgpack-c, its libc++ instantiations) then cannot be merged with
# barretenberg's, while the archive keeps ordinary lazy member semantics. The Mach-O counterpart of
# the ELF relocatable link in src/CMakeLists.txt, which ld64.lld cannot do.
set -euo pipefail
nm=$1 objcopy=$2 ar=$3 out=$4 rsp=$5
shift 5
mapfile -t objects < "$rsp"
dir=$(mktemp -d "$out.XXXXXX")
trap 'rm -rf "$dir"' EXIT

printf '%s\n' "$@" > "$dir/exports"
"$nm" --defined-only --extern-only --just-symbol-name "${objects[@]}" 2>/dev/null |
  grep -v -e '^$' -e ':$' | sort -u |
  grep -vxF -f "$dir/exports" | grep -vE '^__Z(nw|na|dl|da)' |
  awk '{ print $1 " _wsdb_ref." $1 }' > "$dir/renames"

i=0
for object in "${objects[@]}"; do
  "$objcopy" --redefine-syms="$dir/renames" "$object" "$dir/$((i++)).o"
done
rm -f "$out"
(cd "$dir" && "$ar" qc "$out" $(ls *.o | sort -n))
