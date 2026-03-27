# Codegen Vision: Implementation Plan

## Already Done (from current PR)

| Item | Status |
|------|--------|
| Codegen tool is zero-dep pure TS | Done. `node --experimental-strip-types`, no package.json |
| Schemas committed as JSON | Done. 5 schemas in `codegen/schemas/` |
| Generated files not committed (main) | Done. Gitignored, produced at build time |
| Each consumer invokes codegen in bootstrap | Done. ts/rust bootstrap call `codegen/bootstrap.sh generate` |
| Wire compat tests as standalone projects | Partially done. Separate dirs per language, own build systems |
| Schema hash infrastructure | Done but unused. `computeSchemaHash()` exists |

## What's New

### 1. Field Elements as Fixed Arrays

**What**: Fr/Fq should be `array<uint8_t, 32>` in the schema, not the current `alias(fr, bin32)`.

**Current state**: C++ uses `bb::fr` which serializes as `bin32` via an alias. The schema exports `["alias", ["fr", "bin32"]]`. The schema visitor treats this as `bytes` (opaque `Uint8Array`/`Vec<u8>`).

**Changes needed**:

1. **C++ command structs**: No change needed. `bb::fr` already serializes as 32 bytes. The schema export is what needs to change.

2. **Schema export**: The `MsgpackSchemaPacker` in C++ recognizes `bb::fr` and emits `["alias", ["fr", "bin32"]]`. We need it to emit `["array", ["unsigned char", 32]]` instead. This is a one-line change in `serialize/msgpack_impl/schema_name.hpp`.

3. **Schema visitor**: Already handles `["array", ["unsigned char", N]]` → maps to `bytes` primitive. We need to add a new primitive type `field` (or `fr`) that maps to fixed-size 32-byte arrays in each language:
   - TS: `Fr` (branded `Uint8Array` subclass or newtype)
   - Rust: `Fr([u8; 32])` (newtype)
   - C++: `std::array<uint8_t, 32>` (typedef `Fr`)
   - Zig: `Fr = [32]u8`

4. **Re-export schemas**: After C++ schema export change, run `update_schemas.sh` to get fresh JSON.

5. **Regenerate all code**: The codegen will now produce `Fr` types instead of `Uint8Array`/`Vec<u8>`.

**Effort**: Medium. Schema export is a one-line C++ change. Codegen type mapping is ~20 lines per language. The big effort is testing that serialization still works (Fr as fixed array must serialize identically to fr as bin32).

### 2. All Languages Use Generated Code

**What**: Every project's client/server code must use codegen-produced types, serialization, and dispatch.

**Current state**:
- C++ clients (`wsdb_ipc_client_generated.*`): Generated, used in production
- C++ servers (`wsdb_ipc_server.cpp`): Hand-written (generated dispatch exists but isn't wired in — wiring requires making bb-cpp depend on codegen)
- TS clients (`aztec-wsdb/generated/async.ts`): Generated, used in production
- TS servers (`cdb_ipc_server.ts`): Hand-written
- Rust: Generated types exist but `aztec-ipc` crate excluded from workspace (Unknown type issues)
- Zig: Generated types exist but not functional (packValue/readValue not wired)

**Changes needed**:
- Fix Rust codegen to handle `MerkleTreeId` (enum) and `unordered_map` types → unblock `aztec-ipc`
- Wire generated C++ server dispatch into `wsdb_ipc_server.cpp` (requires bb-cpp depending on codegen)
- Wire generated TS server dispatch into `cdb_ipc_server.ts`
- Complete Zig codegen to produce functional serialization code

**Effort**: Large. Each language needs testing. The C++ server wiring changes the Makefile dependency chain.

### 3. Schema Portability (Cross-Language Schema Output)

**What**: Generated code includes a function that outputs the schema JSON + hash. Any language can dump its schema, and all must produce identical output.

**Changes needed**:

1. **Embed schema in generated code**: The codegen already has access to the raw JSON. Include it as a string constant in each language's generated types file.

2. **Add schema dump function**:
   - TS: `export function getSchema(): string { return EMBEDDED_SCHEMA_JSON; }`
   - Rust: `pub fn schema() -> &'static str { EMBEDDED_SCHEMA_JSON }`
   - C++: `const char* get_schema() { return EMBEDDED_SCHEMA_JSON; }`
   - Zig: `pub fn schema() []const u8 { return EMBEDDED_SCHEMA_JSON; }`

3. **Schema hash function**: Already has `SCHEMA_HASH` constant. Just expose it.

4. **Validation**: Any two languages outputting their schema must produce byte-identical JSON.

**Effort**: Small. It's string embedding + a getter function per language.

### 4. Wire Compat Tests as Starter Kits

**What**: Structure as standalone reference implementations. A developer copies one and has a working IPC service.

**Current state**: Already close. Each language has its own dir with build system. But:
- Generated files are committed (should be generated on the fly)
- Missing: project-level README per language
- Missing: Makefile/script that does "generate → build → run"

**Changes needed**:
- Add `generate` step to each language's build script in wire_compat
- Add README per language showing "how to build a service in X"
- Gitignore generated files in wire_compat (generate from schema)

**Effort**: Small.

## Execution Order

### Phase A: Field Elements (foundation — everything else depends on this)
1. Update C++ schema export: `bb::fr` → `["array", ["unsigned char", 32]]`
2. Add `Fr` type to schema visitor and all language codegen
3. Re-export schemas
4. Regenerate all code
5. Test wire compat

### Phase B: Schema Portability
1. Embed schema JSON in generated code (all languages)
2. Add `getSchema()` / `schemaHash()` functions
3. Add cross-language schema identity test

### Phase C: Wire Compat as Starter Kits
1. Add per-language generate step to wire_compat builds
2. Gitignore generated files in wire_compat
3. Add READMEs

### Phase D: All Languages Use Generated Code (largest, can be incremental)
1. Fix Rust codegen for enum/map types → unblock aztec-ipc
2. Wire C++ server dispatch (requires Makefile dependency change)
3. Wire TS server dispatch
4. Complete Zig codegen serialization

## What NOT To Do Now

- Field arithmetic in generated types — consumers bring their own
- Async/streaming IPC — current request/response is sufficient
- Protobuf migration — decided against, staying with msgpack
