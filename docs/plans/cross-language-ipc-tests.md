# Cross-Language IPC Integration Test Plan

## Current Test State

### What exists today
| Test | Location | What it tests |
|------|----------|---------------|
| C++ wire compat | `barretenberg/cpp/src/barretenberg/wsdb/wsdb_wire_compat.test.cpp` | Msgpack structure of WSDB commands (C++ only, no cross-language) |
| Rust pipe test | `barretenberg/rust/tests/src/pipe_test.rs` | PipeBackend → bb binary (bb schema, not wsdb/cdb) |
| TS jest tests | `barretenberg/ts/src/**/*.test.ts` | Various TS module tests, none for codegen |
| IVC integration | `yarn-project/ivc-integration/` | TS → C++ binary via NAPI/IPC (full proving stack) |

### What's missing
- **Zero tests for any codegen output** — no test verifies that `RustCodegen`, `ZigCodegen`, `CppCodegen`, or `TypeScriptCodegen` produce valid code
- **Zero cross-language wire tests** — no test verifies that Rust/Zig/TS/C++ produce byte-identical msgpack for the same command
- **Zero IPC round-trip tests** — no test where one language acts as server and another as client

## Test Design

### Core Idea: Echo Server + Multi-Client Round-Trip

Build a minimal "echo" IPC service with a tiny schema (3 commands, simple types) that:
1. Exists purely for testing — not tied to wsdb/cdb/avm complexity
2. Has implementations in all 4 languages (both client and server)
3. Tests every language pair: C++ server + Rust client, Zig server + TS client, etc.

### Why a test-only schema, not WSDB

Using WSDB's real schema would require:
- Building the full `aztec-wsdb` binary with world state, LMDB, merkle trees
- Running `aztec-wsdb msgpack schema` (requires C++ build)
- Each test server would need actual WSDB business logic

A test-only echo schema avoids all of this. The echo server just returns the command fields back in the response, proving that serialization/deserialization works identically across languages.

### Echo Schema Definition

```
Commands:
  EchoBytes    { data: bytes }                    → EchoBytesResponse { data: bytes }
  EchoFields   { a: u32, b: u64, name: string }  → EchoFieldsResponse { a: u32, b: u64, name: string }
  EchoNested   { inner: EchoInner }               → EchoNestedResponse { inner: EchoInner }
  Shutdown     {}                                  → ShutdownResponse {}

Types:
  EchoInner    { values: vector<bytes>, flag: optional<bool> }

Error:
  ErrorResponse { message: string }
```

This covers: primitives, bytes, strings, vectors, optionals, nested structs — all the types that matter for wire compat.

### Test Architecture

```
test/wire_compat/
  schema.json              # Hand-written echo schema (same format as `binary msgpack schema`)
  golden/                  # Golden msgpack files (reference serializations)
    echo_bytes_request.msgpack
    echo_fields_request.msgpack
    echo_nested_request.msgpack

  generate.ts              # Runs codegen on schema.json → all 4 languages

  cpp/
    echo_server.cpp        # C++ echo server (hand-written, uses generated dispatch)
    echo_client.cpp        # C++ echo client (hand-written, uses generated client)
    CMakeLists.txt

  ts/
    echo_server.ts         # TS echo server (uses generated server dispatch)
    echo_client.ts         # TS echo client (uses generated async API)
    wire_compat.test.ts    # Jest: golden file + round-trip tests

  rust/
    echo_server.rs         # Rust echo server (implements generated Handler trait)
    echo_client.rs         # Rust echo client (uses generated API + UdsBackend)
    Cargo.toml

  zig/
    echo_server.zig        # Zig echo server (uses generated handler vtable)
    echo_client.zig        # Zig echo client (uses generated client struct)
    build.zig
```

### Test Levels

#### Level 1: Golden File Tests (per-language, no IPC)

Each language serializes the same command values to msgpack bytes and compares against golden files.

```
For each language L:
  For each test command C (EchoBytes, EchoFields, EchoNested):
    1. Construct C with known values
    2. Serialize to msgpack (request format: [[name, {fields}]])
    3. Compare byte-for-byte against golden/<C>_request.msgpack
    4. Deserialize back and compare field values
```

**Golden files generated once** by the C++ reference implementation (since C++ is the canonical msgpack-c library that all services use).

**Integration**: Each language runs these as unit tests in its own test framework:
- C++: gtest (`wsdb_wire_compat_tests` pattern, but for echo schema)
- TS: jest (`wire_compat.test.ts`)
- Rust: `#[test]` in the Rust echo crate
- Zig: `test` blocks in echo_client.zig

#### Level 2: Same-Language Round-Trip (per-language, with IPC)

Each language starts its own echo server, connects with its own client, sends commands, verifies responses.

```
For each language L:
  1. Start L's echo server on a temp UDS socket
  2. Connect L's echo client
  3. Send each test command
  4. Verify response matches expected values
  5. Send Shutdown, verify clean exit
```

**Integration**: Run as integration tests with a longer timeout.

#### Level 3: Cross-Language Round-Trip (the full matrix)

Every client language talks to every server language.

```
For each server language S:
  For each client language C:
    1. Start S's echo server on /tmp/echo-<S>-<C>-<pid>.sock
    2. Connect C's echo client
    3. Send EchoBytes, EchoFields, EchoNested
    4. Verify all responses
    5. Shutdown
```

**Matrix** (16 combinations):
```
Server \ Client │  C++  │  TS   │  Rust │  Zig
────────────────┼───────┼───────┼───────┼──────
C++             │   ✓   │   ✓   │   ✓   │   ✓
TypeScript      │   ✓   │   ✓   │   ✓   │   ✓
Rust            │   ✓   │   ✓   │   ✓   │   ✓
Zig             │   ✓   │   ✓   │   ✓   │   ✓
```

**Integration**: Single orchestrator script (bash or TS) that:
1. Builds all 4 echo binaries
2. Runs all 16 pairs sequentially
3. Reports pass/fail per pair
4. Cleans up sockets and processes

### Implementation Details

#### Echo Server Protocol (all languages)

Each echo server binary is invoked as:
```bash
./echo_server_<lang> --socket /tmp/echo.sock
```

It:
1. Listens on the UDS socket
2. Accepts one connection
3. Reads length-prefixed msgpack requests
4. Dispatches via the generated handler:
   - `EchoBytes` → returns `{ data: cmd.data }` (echo back)
   - `EchoFields` → returns `{ a: cmd.a, b: cmd.b, name: cmd.name }`
   - `EchoNested` → returns `{ inner: cmd.inner }`
   - `Shutdown` → sends response, exits
5. Wraps any exception as `ErrorResponse`

Each echo client binary is invoked as:
```bash
./echo_client_<lang> --socket /tmp/echo.sock
```

It:
1. Connects to the UDS socket
2. Sends all test commands with known values
3. Verifies each response
4. Sends Shutdown
5. Exits 0 on success, non-zero on failure (with error message to stderr)

#### Generating Code from the Test Schema

The test schema is hand-written JSON matching the format of `binary msgpack schema` output. The `generate.ts` script in the test directory:

```typescript
import { SchemaVisitor } from '../../barretenberg/ts/src/cbind/schema_visitor.js';
import { CppCodegen } from '../../barretenberg/ts/src/cbind/cpp_codegen.js';
import { RustCodegen } from '../../barretenberg/ts/src/cbind/rust_codegen.js';
import { ZigCodegen } from '../../barretenberg/ts/src/cbind/zig_codegen.js';
import { TypeScriptCodegen } from '../../barretenberg/ts/src/cbind/typescript_codegen.js';

// Load hand-written schema.json
const schema = JSON.parse(fs.readFileSync('schema.json', 'utf-8'));
const compiled = new SchemaVisitor().visit(schema.commands, schema.responses);

// Generate all language bindings
// ... write to cpp/, ts/, rust/, zig/ subdirectories
```

This means the test **also validates the codegen itself** — if codegen produces broken code, the test binaries won't compile.

#### Golden File Generation

A one-time step that creates reference msgpack files:

```bash
# Build and run the C++ golden file generator
./echo_golden_gen > golden/echo_bytes_request.msgpack    # etc.
```

Alternatively, commit golden files statically (hand-crafted msgpack hex). This is more robust since it doesn't depend on any language being "correct" — it's the specification.

### CI Integration

#### Makefile Target

```makefile
# In barretenberg section of Makefile
bb-ipc-wire-compat-tests:
    $(call test,$@,test/wire_compat)
```

#### bootstrap.sh test_cmds

```bash
# test/wire_compat/bootstrap.sh
test_cmds() {
    # Level 1: Golden file tests (fast, per-language)
    echo "$(hash) test/wire_compat/scripts/run_golden_tests.sh cpp"
    echo "$(hash) test/wire_compat/scripts/run_golden_tests.sh ts"
    echo "$(hash) test/wire_compat/scripts/run_golden_tests.sh rust"
    echo "$(hash) test/wire_compat/scripts/run_golden_tests.sh zig"

    # Level 2+3: IPC round-trip (slower, needs all binaries)
    echo "$(hash):TIMEOUT=5m test/wire_compat/scripts/run_cross_language_tests.sh"
}
```

#### CI Labels

- `ci-barretenberg`: Includes all levels (golden files + same-language + cross-language matrix). All toolchains (C++, TS, Rust, Zig) are assumed present in CI.

### Build Dependencies

| Test Level | Requires |
|------------|----------|
| Level 1 (golden) | Per-language build only |
| Level 2 (same-lang IPC) | Per-language server + client build |
| Level 3 (cross-lang IPC) | All 4 languages built |

### Estimated Implementation Effort

| Component | LOC | Effort |
|-----------|-----|--------|
| `schema.json` (hand-written echo schema) | ~50 | Small |
| `generate.ts` (run codegen on test schema) | ~80 | Small |
| Golden file test per language (4x) | ~60 each | Medium |
| Echo server per language (4x) | ~40 each | Medium |
| Echo client per language (4x) | ~50 each | Medium |
| Cross-language orchestrator | ~100 | Medium |
| CI integration (bootstrap + Makefile) | ~30 | Small |
| **Total** | ~900 | **~2 sessions** |

### Phased Rollout

**Phase A**: Hand-write `schema.json`, run codegen, verify all 4 languages produce compilable code. This alone catches most codegen bugs.

**Phase B**: Golden file tests for all 4 languages. Each language serializes test commands and checks against committed golden bytes.

**Phase C**: Same-language echo round-trip (4 tests). Proves client + server work in each language.

**Phase D**: Cross-language matrix (16 tests). The full wire-compat validation.

### Key Risks

| Risk | Mitigation |
|------|------------|
| Zig build infra not in CI | Level 1 Zig tests can run anywhere zig is installed; gate on `which zig` |
| Long test time for 16 pairs | Each pair takes <1s (echo is trivial); full matrix under 30s |
| Golden files drift from real schemas | Golden files test the echo schema only, not real service schemas. Real schemas tested by actually running the services. |
| Test-only schema doesn't cover all types | Include bytes, u32, u64, string, vector, optional, nested struct — matches the types actually used in wsdb/cdb/avm |
