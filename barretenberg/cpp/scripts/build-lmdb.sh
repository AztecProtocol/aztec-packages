#!/bin/bash
# Build LMDB's static library via its upstream Makefile.
#
# LMDB's Makefile decides what to recompile purely from source timestamps, so a
# change of C toolchain alone leaves the previously built objects untouched.
# Those stale objects can be compiled against a different glibc than the one we
# link against: switching the build directory between the system-clang `default`
# preset (host glibc) and the zig-wrapped `clang20` preset (glibc 2.35) produces
# errors such as an undefined `__isoc23_strtol`, a symbol that exists in host
# glibc >=2.38 headers but not in the pinned 2.35 we link against.
#
# Track the active compiler and force a clean rebuild when it changes so LMDB is
# always built with the same toolchain as the rest of barretenberg. When the
# toolchain is unchanged the final `make` is a no-op and liblmdb.a is left
# untouched, so dependents are not needlessly relinked.
set -euo pipefail

cc="$1"
ar="$2"

cd libraries/liblmdb

stamp=.bb_toolchain_stamp
printf '%s\n' "$cc" >"$stamp.tmp"
if ! cmp -s "$stamp.tmp" "$stamp" 2>/dev/null; then
  CC="$cc" AR="$ar" make -e clean
  mv "$stamp.tmp" "$stamp"
else
  rm -f "$stamp.tmp"
fi

# Drop any inherited C/C++ flags so LMDB uses its own Makefile defaults.
unset CFLAGS CXXFLAGS
export CC="$cc" AR="$ar"
make -e XCFLAGS=-fPIC liblmdb.a
