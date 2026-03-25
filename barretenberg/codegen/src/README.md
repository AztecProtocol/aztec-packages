# Multi-Language IPC Code Generation

Generates type-safe client and server bindings from Aztec IPC service schemas
in four languages: **C++**, **TypeScript**, **Rust**, and **Zig**.

## Architecture

```
C++ Service Binaries (aztec-wsdb, aztec-cdb, aztec-avm, bb)
    │
    │  `./binary msgpack schema`  →  JSON to stdout
    ▼
Raw Schema JSON
    │
    │  SchemaVisitor  (schema_visitor.ts)
    ▼
CompiledSchema IR  (language-neutral)
    │
    ├──► TypeScriptCodegen  →  types, async client, server dispatch
    ├──► CppCodegen         →  IPC client class, server handler
    ├──► RustCodegen        →  types, API struct, Handler trait
    └──► ZigCodegen         →  types, client struct, handler vtable
```

## Files

| File | Purpose |
|------|---------|
| `generate.ts` | Unified entry point — runs all services and languages |
| `service_codegen.ts` | Service configs, language target wiring, `generateForService()` |
| `schema_visitor.ts` | Compiles raw JSON schema to `CompiledSchema` IR |
| `typescript_codegen.ts` | TypeScript types, async/sync client, server dispatch |
| `cpp_codegen.ts` | C++ IPC client class, server handler function |
| `rust_codegen.ts` | Rust types/enums, API struct, Handler trait |
| `zig_codegen.ts` | Zig structs, client, handler vtable |
| `naming.ts` | Shared naming utilities (snake_case, PascalCase) |
| `SCHEMA_SPEC.md` | Wire protocol and schema format specification |

## Services

| Service | Binary | Languages | Client | Server |
|---------|--------|-----------|--------|--------|
| bb | `bb` | TS, Rust | yes | no |
| wsdb | `aztec-wsdb` | TS, C++, Rust, Zig | yes | yes |
| cdb | `aztec-cdb` | TS, C++, Rust, Zig | yes | yes |
| avm | `aztec-avm` | TS, Rust, Zig | yes | no |

## Usage

```bash
# Generate all services, all languages
yarn generate

# Generate a single service
yarn generate:wsdb

# Generate specific services via unified entry point
npx tsx src/cbind/generate.ts wsdb cdb
```

## Adding a New Command

1. Define the command struct in C++ with `MSGPACK_SCHEMA_NAME` and `SERIALIZATION_FIELDS`
2. Add a nested `Response` struct
3. Add both to the service's `Command` and `CommandResponse` NamedUnion types
4. Run `yarn generate`
5. All language bindings regenerate automatically

## Adding a New Language

1. Create `<language>_codegen.ts` implementing `generateTypes()`, `generateClient()`, `generateServer()`
2. Add a target helper function in `service_codegen.ts`
3. Wire it into the relevant service configs
4. See `SCHEMA_SPEC.md` for the wire protocol contract

## Output Locations

- **TypeScript**: `src/aztec-{wsdb,cdb,avm}/generated/`
- **C++**: `cpp/src/barretenberg/{wsdb,cdb}/*_generated.{hpp,cpp}`
- **Rust**: `rust/aztec-ipc/src/{wsdb,cdb,avm}/`
- **Zig**: `zig/aztec-ipc/src/{wsdb,cdb,avm}/`

## Schema Versioning

Each generated file includes a `SCHEMA_HASH` constant (SHA-256 of the raw schema JSON).
Clients can check this at connection time to detect incompatible schema changes.
