#!/usr/bin/env bash
# Builds build/hermes_host (test/hermes_host.cpp): Hermes with the package's native module installed, as an app
# has it, and an event loop, for the package's tests. Needs build/hermes (build_hermes.sh) and third_party
# (vendor.sh).
set -euo pipefail

cd "$(dirname "$0")/.."

cc=${CC:-clang}
cxx=${CXX:-clang++}
mkdir -p build/obj

$cc -c -O2 -w -Ithird_party/sqlite3mc cpp/sqlite3mc_unit.c -o build/obj/sqlite3mc.o
$cxx -std=c++20 -O2 -Wall -Wextra -Werror -Ithird_party/kv-sqlite -Ithird_party/ipc-runtime-jsi \
  -Ithird_party/msgpack-c/include -Ithird_party/sqlite3mc -c cpp/kv_sqlite_unit.cpp -o build/obj/kv_sqlite.o
$cxx -std=c++20 -O2 -g -Wall -Wextra -Werror \
  -Ibuild/hermes/include -Icpp -Ithird_party/ipc-runtime-jsi \
  test/hermes_host.cpp cpp/aztec_react_native.cpp third_party/ipc-runtime-jsi/ipc_runtime_jsi.cpp \
  build/obj/kv_sqlite.o build/obj/sqlite3mc.o -Lbuild/hermes/lib -lhermesvm build/hermes/lib/libjsi.a \
  -Wl,-rpath,'$ORIGIN/hermes/lib' -ldl -pthread -o build/hermes_host
