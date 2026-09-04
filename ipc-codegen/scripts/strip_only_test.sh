#!/usr/bin/env bash
#
# The generator must run under Node's type stripping alone, with no transform
# step: only erasable TypeScript, so no parameter properties, enums, namespaces
# or decorators in ipc-codegen/src. Node reports those as
# ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX at module load, which takes out every
# --lang at once, so generate one of each here rather than trusting the callers
# to notice.
source $(git rev-parse --show-toplevel)/ci3/source

schema="$root/ipc-codegen/echo_example/schema/schema.jsonc"
out=$(mktemp -d)
trap "rm -rf $out" EXIT

for lang in rust ts zig cpp; do
  node --experimental-strip-types --no-warnings "$root/ipc-codegen/src/generate.ts" \
    --schema "$schema" --lang "$lang" --out "$out/$lang" --server --client >/dev/null
done

echo "generate.ts runs strip-only for rust, ts, zig and cpp."
