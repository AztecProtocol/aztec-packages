# Codegen Tool Restructuring Plan

## Problem

The codegen tool lives inside `barretenberg/ts/` (bb.js) but generates files that bb.js itself needs to compile. This creates a circular dependency:

```
bb.js build → yarn clean → deletes generated files
                → yarn generate → needs C++ binaries AND the codegen tool to be runnable
                → yarn build:esm → needs generated files
```

With `ci-full-no-test-cache`, there's no cache to paper over this. The codegen must be an independent build step that runs before consumers.

## Current State

### Where codegen lives
```
barretenberg/ts/src/cbind/
  generate.ts           # Entry point (runs via ts-node/tsx)
  service_codegen.ts    # Orchestrator
  schema_visitor.ts     # Schema IR compiler
  typescript_codegen.ts # TS generator
  cpp_codegen.ts        # C++ generator
  rust_codegen.ts       # Rust generator
  zig_codegen.ts        # Zig generator
  naming.ts             # Naming utilities
```

### Dependencies of the codegen tool
- **Runtime**: Node.js + `msgpackr` (for curve constants only). Zero other npm deps.
- **No imports from bb.js**: The codegen files import only from each other and Node builtins.
- **C++ binaries**: Only needed at generation time (to fetch schemas via `binary msgpack schema`).

### Current build order (Makefile)
```
avm-transpiler → bb-cpp-native → bb-ts → bb-rs
                                    ↑
                              yarn generate (codegen runs here)
```

### Current hash chain
```
bb-cpp hash = hash(avm-transpiler hash, cpp .rebuild_patterns)
bb-ts hash  = hash(bb-cpp hash, ts .rebuild_patterns, release flag, AVM flag)
bb-rs hash  = hash(bb-ts hash, rust .rebuild_patterns)
```

## Proposed Structure

### New top-level directory
```
barretenberg/codegen/
  package.json          # Minimal: just msgpackr dep
  tsconfig.json         # Standalone TS config
  src/
    generate.ts         # Entry point (moved from ts/src/cbind/)
    service_codegen.ts
    schema_visitor.ts
    typescript_codegen.ts
    cpp_codegen.ts
    rust_codegen.ts
    zig_codegen.ts
    naming.ts
    SCHEMA_SPEC.md
  bootstrap.sh          # Builds the codegen tool (just npm install)
  .rebuild_patterns     # Files that invalidate codegen tool cache
```

### What stays in `barretenberg/ts/`
- `src/cbind/generated/` — **not committed** to git, generated at build time
- `src/aztec-wsdb/generated/` — same
- `src/aztec-cdb/generated/` — same
- `src/aztec-avm/generated/` — same
- The thin per-service wrapper scripts (e.g. `src/aztec-wsdb/generate.ts`) are removed — codegen invoked directly from bootstrap

### What stays in `barretenberg/rust/`
- `barretenberg-rs/src/api.rs` — **not committed**, generated at build time
- `barretenberg-rs/src/generated_types.rs` — **not committed**, generated at build time

## New Build Order

```
                    avm-transpiler
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
      bb-codegen    bb-cpp-native-objects
            │            │
            │       bb-cpp-native  (links with avm-transpiler)
            │            │
            ├────────────┤
            ▼            ▼
      bb-ts-generate    bb-cpp-generate    bb-rs-generate
            │                │                   │
            ▼                ▼                   ▼
         bb-ts           (cpp already          bb-rs
                          has generated
                          files from
                          bb-cpp-generate)
```

### Detailed steps

1. **`bb-codegen`** (new Makefile target)
   - `cd barretenberg/codegen && ./bootstrap.sh`
   - Just runs `npm install` (< 2 seconds)
   - Cache key: `hash(codegen .rebuild_patterns)`
   - No dependency on C++ build

2. **`bb-cpp-native`** (unchanged)
   - Builds C++ binaries including `bb`, `aztec-wsdb`, `aztec-cdb`, `aztec-avm`
   - These binaries can dump their schemas via `msgpack schema`

3. **`bb-ts-generate`** (new, runs after bb-codegen + bb-cpp-native)
   - `cd barretenberg/codegen && npx tsx src/generate.ts`
   - Invokes each binary's `msgpack schema`, generates TS/Rust/C++ output
   - Writes to `barretenberg/ts/src/*/generated/`, `barretenberg/rust/*/src/`, etc.
   - Cache key: `hash(bb-codegen hash, bb-cpp hash)` — invalidates when either changes

4. **`bb-ts`** (modified — no longer runs `yarn generate`)
   - `yarn clean && yarn build:wasm && yarn build:native && yarn build:esm && ...`
   - Generated files are already in place from step 3
   - Cache key: `hash(bb-ts-generate hash, ts .rebuild_patterns)`

5. **`bb-rs`** (modified — no longer runs `cd ../ts && yarn generate`)
   - Generated files already in place from step 3
   - `cargo build --release`
   - Cache key: `hash(bb-ts-generate hash, rust .rebuild_patterns)`

## Makefile Changes

### New targets
```makefile
# Codegen tool (fast — just npm install)
bb-codegen:
	$(call build,$@,barretenberg/codegen)

# Generate bindings for all consumers (needs codegen tool + C++ binaries)
bb-generate: bb-codegen bb-cpp-native
	$(call build,$@,barretenberg/codegen,generate)
```

### Modified dependencies
```makefile
# Before:
bb-ts: bb-cpp-wasm bb-cpp-wasm-threads bb-cpp-native

# After:
bb-ts: bb-cpp-wasm bb-cpp-wasm-threads bb-cpp-native bb-generate

# Before:
bb-rs: bb-ts bb-cpp-native

# After:
bb-rs: bb-generate bb-cpp-native
# (no longer depends on bb-ts! Just needs generated files + C++ libs)
```

## Hash Computation

### `barretenberg/codegen/bootstrap.sh`
```bash
export hash=$(cache_content_hash .rebuild_patterns)
# .rebuild_patterns: ^barretenberg/codegen/.*$
```

### Generation hash (in codegen bootstrap.sh `generate` function)
```bash
generate_hash=$(hash_str \
  $(cache_content_hash .rebuild_patterns) \
  $(../cpp/bootstrap.sh hash))
```

This means:
- Codegen tool changes → re-generate
- C++ binary changes (schema changes) → re-generate
- TS source changes (non-codegen) → do NOT re-generate (just rebuild bb.js)

### Modified `barretenberg/ts/bootstrap.sh`
```bash
# Before:
hash=$(hash_str $(../cpp/bootstrap.sh hash) $(cache_content_hash .rebuild_patterns) ...)

# After:
hash=$(hash_str \
  $(../codegen/bootstrap.sh generate_hash) \
  $(cache_content_hash .rebuild_patterns) \
  $(semver check $REF_NAME && echo 1 || echo 0) \
  ${AVM_TRANSPILER:-1})
```

bb-ts hash now depends on codegen's generation hash (which transitively depends on cpp hash).

### Modified `barretenberg/rust/bootstrap.sh`
```bash
# Before:
hash=$(hash_str $(../ts/bootstrap.sh hash) $(cache_content_hash .rebuild_patterns))

# After:
hash=$(hash_str $(../codegen/bootstrap.sh generate_hash) $(cache_content_hash .rebuild_patterns))
# No longer depends on bb-ts hash — just needs generated files + its own sources
```

## Codegen Bootstrap Script

```bash
#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

export hash=$(cache_content_hash .rebuild_patterns)

function build {
  echo_header "codegen tool build"
  if ! cache_download codegen-$hash.tar.gz; then
    npm_install_deps
    cache_upload codegen-$hash.tar.gz node_modules
  fi
}

function generate {
  # Hash includes both codegen tool AND C++ binary schemas
  local gen_hash=$(hash_str $hash $(../cpp/bootstrap.sh hash))
  export generate_hash=$gen_hash

  echo_header "codegen generate"
  if ! cache_download codegen-generate-$gen_hash.tar.gz; then
    # Run codegen for all services
    npx tsx src/generate.ts

    # Collect all generated output for caching
    cache_upload codegen-generate-$gen_hash.tar.gz \
      ../ts/src/cbind/generated \
      ../ts/src/aztec-wsdb/generated \
      ../ts/src/aztec-cdb/generated \
      ../ts/src/aztec-avm/generated \
      ../rust/barretenberg-rs/src/generated_types.rs \
      ../rust/barretenberg-rs/src/api.rs
  fi
}

function generate_hash {
  local gen_hash=$(hash_str $hash $(../cpp/bootstrap.sh hash))
  echo $gen_hash
}

# Dispatch
case "${1:-build}" in
  hash) echo $hash ;;
  generate_hash) generate_hash ;;
  build) build ;;
  generate) build && generate ;;
  *) echo "Unknown command: $1" ;;
esac
```

## Migration Steps

### Phase 1: Move codegen files
1. Create `barretenberg/codegen/` with `package.json`, `tsconfig.json`
2. Move all `barretenberg/ts/src/cbind/*.ts` (except generated/) to `barretenberg/codegen/src/`
3. Update imports in `generate.ts` (paths change)
4. Remove per-service generate.ts wrappers from `ts/src/aztec-*/`
5. Write `barretenberg/codegen/bootstrap.sh`

### Phase 2: Update consumers
1. Remove `yarn generate` from `barretenberg/ts/package.json` build script
2. Remove `cd ../ts && yarn generate` from `barretenberg/rust/bootstrap.sh`
3. Restore gitignore for generated files (they're not committed)
4. Update `barretenberg/ts/package.json` clean to not touch generated dirs (already done)

### Phase 3: Update Makefile
1. Add `bb-codegen` target
2. Add `bb-generate` target (depends on bb-codegen + bb-cpp-native)
3. Update `bb-ts` to depend on `bb-generate`
4. Update `bb-rs` to depend on `bb-generate` (remove bb-ts dependency)
5. Update hash computation in ts/rust bootstrap.sh

### Phase 4: Verify
1. Run `./bootstrap.sh` from root — full build should work
2. Run with `NO_CACHE=1` — no cache, must generate everything
3. Change a C++ command struct → verify codegen re-runs and all consumers rebuild
4. Change a codegen template → verify regeneration + consumer rebuild
5. Change only TS source (not codegen) → verify no re-generation, just rebuild

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| `npx tsx` not available in codegen dir | `package.json` includes tsx as devDep, or use ts-node |
| Path resolution breaks after move | All paths are relative to `__dirname` in codegen; update once during move |
| Cache invalidation too aggressive | Generation hash only includes codegen + cpp hashes, not TS/Rust source changes |
| Cache invalidation too lax | .rebuild_patterns covers all codegen source files |
| bb-rs no longer depends on bb-ts | Correct — bb-rs only needs generated types + C++ libs, not the full bb.js build |

## What This Achieves

1. **No circular dependency**: codegen tool builds independently, generates before consumers compile
2. **No committed generated files**: they're build artifacts, generated fresh each time
3. **Cache-honoring**: generation has its own hash, invalidates when codegen or C++ changes
4. **Parallel-friendly**: `bb-codegen` can run in parallel with `bb-cpp-native-objects`
5. **bb-rs decoupled from bb-ts**: Rust crate no longer transitively depends on the full bb.js build
