#!/bin/bash
# Build LMDB's static library via its upstream Makefile, hermetically.
#
# LMDB is an ExternalProject that shells out to its own `make`, nested inside the
# wider barretenberg build (root `make` -> bootstrap -> cmake -> ninja -> here).
# Two things make a naive `CC=<compiler> make -e` unreliable:
#
#   1. GNU make precedence. A `CC` inherited from an outer make as a command-line
#      variable (propagated via MAKEFLAGS) outranks BOTH the environment and
#      `make -e`. So an ambient `CC=gcc` silently builds LMDB with the host
#      compiler even though every other barretenberg target uses the zig-wrapped
#      clang. The host glibc (>=2.38) redirects strtol -> __isoc23_strtol, a
#      symbol absent from the zig-pinned glibc 2.35 we link against, so the
#      _bench/_test links fail with `undefined symbol: __isoc23_strtol`.
#   2. Timestamp-only rebuilds. LMDB's Makefile recompiles on source timestamps
#      only, so switching the build dir's toolchain (e.g. system-clang `default`
#      preset -> zig `clang20`) leaves stale objects built against another glibc.
#
# Fix: drop the inherited make/toolchain state, force a clean rebuild when the
# compiler changes, and pass the toolchain on make's command line so it always
# matches the rest of barretenberg regardless of how the outer build was invoked.
set -euo pipefail

cc="$1"
ar="$2"

cd libraries/liblmdb

# Sever toolchain settings inherited from the outer make / environment.
unset MAKEFLAGS MFLAGS CC CXX CFLAGS CXXFLAGS

# Force a clean rebuild when the active compiler changes; no-op otherwise, so a
# steady-state build leaves liblmdb.a untouched and dependents are not relinked.
stamp=.bb_toolchain_stamp
printf '%s\n' "$cc" >"$stamp.tmp"
if ! cmp -s "$stamp.tmp" "$stamp" 2>/dev/null; then
  make clean
  mv "$stamp.tmp" "$stamp"
else
  rm -f "$stamp.tmp"
fi

# Command-line CC/AR outrank the Makefile default and any inherited override.
make CC="$cc" AR="$ar" XCFLAGS=-fPIC liblmdb.a
