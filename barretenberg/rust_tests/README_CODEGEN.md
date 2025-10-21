# Code Generation from Msgpack Schema

This directory includes automatically generated Rust types from the Barretenberg msgpack schema.

## How It Works

The code generation follows the same pattern as the TypeScript bindings:

1. **Schema Source**: The `bb` binary exposes its API schema via `bb msgpack schema`
2. **Generator**: TypeScript code in `barretenberg/ts/src/cbind/` generates both TS and Rust code
3. **Output**: Rust types are generated to `barretenberg-rs/src/generated_types.rs`

## Running the Generator

### Prerequisites

1. Build the BB binary:
   ```bash
   cd ../cpp
   cmake --preset clang16
   cmake --build --preset clang16
   ```

2. Install TypeScript dependencies:
   ```bash
   cd ../ts
   npm install
   ```

### Generate Code

```bash
cd ../ts
npm run generate
```

This will:
- Fetch the schema from `bb msgpack schema`
- Generate TypeScript files to `ts/src/cbind/generated/`
- Generate Rust files to `rust_tests/barretenberg-rs/src/generated_types.rs`

## Generated Files

### TypeScript Outputs
- `ts/src/cbind/generated/api_types.ts` - Shared type definitions
- `ts/src/cbind/generated/sync.ts` - Synchronous API
- `ts/src/cbind/generated/async.ts` - Asynchronous API

### Rust Outputs
- `rust_tests/barretenberg-rs/src/generated_types.rs` - All types, Command/Response enums

## Architecture

### TypeScript Generator (`rust_schema_compiler.ts`)

The Rust schema compiler mirrors the TypeScript schema compiler but outputs Rust code:

```typescript
export class RustSchemaCompiler {
  processApiSchema(commandsSchema, responsesSchema) {
    // Extract type information
    // Build command/response metadata
  }

  compile(): string {
    // Generate Rust structs
    // Generate Command enum
    // Generate Response enum
  }
}
```

### Schema Mapping

| Msgpack Type | TypeScript | Rust |
|--------------|------------|------|
| `bool` | `boolean` | `bool` |
| `int` | `number` | `u32` |
| `string` | `string` | `String` |
| `bin32` | `Uint8Array` | `Vec<u8>` |
| `vector<T>` | `T[]` | `Vec<T>` |
| `map<K,V>` | `Record<K,V>` | `HashMap<K,V>` |
| `optional<T>` | `T \| undefined` | `Option<T>` |
| `array<T,N>` | `T[]` | `[T; N]` |

### Example Generated Code

**From schema:**
```json
{
  "__typename": "Blake2sCommand",
  "data": ["vector", ["unsigned char"]]
}
```

**Generates Rust:**
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blake2sCommand {
    pub data: Vec<u8>,
}
```

## Current vs Generated Types

Currently, we maintain hand-written types in `types.rs`. The generated types are:

- ✅ **Generated**: Kept in sync with BB schema automatically
- ⚠️ **Hand-written**: May drift from BB schema

### Migration Plan

1. **Phase 1** (Current): Both exist side-by-side
   - Hand-written types in `types.rs`
   - Generated types in `generated_types.rs`
   - Tests use hand-written types

2. **Phase 2**: Gradual migration
   - Update API to use generated types
   - Update tests to use generated types
   - Deprecate hand-written types

3. **Phase 3**: Full automation
   - Remove `types.rs`
   - Use only `generated_types.rs`
   - CI enforces schema sync

## Workflow

### For Development

```bash
# 1. Make changes to BB C++ API
cd barretenberg/cpp/src/barretenberg/api
# ... edit api_msgpack.hpp ...

# 2. Rebuild BB
cd ../../../
cmake --build --preset clang16

# 3. Regenerate bindings
cd ../ts
npm run generate

# 4. Rebuild Rust tests
cd ../rust_tests
cargo build

# 5. Run tests
cargo test
```

### For Testing Without BB Binary

The mock backend tests don't require the BB binary and work with hand-written types:

```bash
cargo test mock_backend
```

## Future Enhancements

1. **API Generation**: Generate full Rust API (like TypeScript's SyncApi/AsyncApi)
2. **Build Integration**: Auto-generate on `cargo build` via build.rs
3. **Validation**: Compare hand-written vs generated types
4. **Documentation**: Generate rustdoc from schema descriptions
