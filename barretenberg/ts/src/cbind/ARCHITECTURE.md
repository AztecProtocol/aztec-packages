# Barretenberg Multi-Language Code Generator Architecture

**Version**: 2.0
**Status**: Production
**Author**: Multi-language binding generator redesign

## Philosophy

This architecture embodies three core principles:

1. **Separation of Concerns**: Schema parsing, type resolution, and code emission are distinct layers
2. **Language Agnosticism**: The compiled schema knows nothing about target languages
3. **Extensibility**: Adding a new language requires implementing one codegen class

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     BB Msgpack Schema                        │
│              (Raw JSON from bb binary)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  SCHEMA VISITOR                              │
│                                                              │
│  SchemaVisitor: Raw Schema → CompiledSchema                 │
│  ├─ Type resolution & inference                             │
│  ├─ Recursive type discovery                                │
│  ├─ Command/Response pairing                                │
│  └─ Struct deduplication                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                COMPILED SCHEMA                               │
│                                                              │
│  Language-agnostic type system:                             │
│  ├─ Type: Composable type definitions                      │
│  ├─ Struct: Product types with fields                      │
│  ├─ Command: API methods with response types               │
│  └─ CompiledSchema: Complete API definition                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   CODEGEN LAYER                              │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │    Rust      │  │     Zig      │  │   Future     │     │
│  │   Codegen    │  │   Codegen    │  │  Languages   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  Each codegen implements:                                   │
│  ├─ Type mapping (Type → language types)                   │
│  ├─ Serialization strategy                                 │
│  ├─ Memory model (ownership, GC, etc.)                     │
│  └─ Idiomatic code patterns                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     TARGET CODE                              │
│                                                              │
│  ├─ generated_types.{rs,zig,...}                           │
│  └─ api.{rs,zig,...}                                       │
└─────────────────────────────────────────────────────────────┘
```

## Layer 1: Schema Visitor & Compiled Schema

### Design Philosophy

The SchemaVisitor walks the raw msgpack schema and produces a CompiledSchema that:
- **Resolves** all type references into a connected graph
- **Discovers** nested struct types recursively
- **Pairs** commands with their response types
- **Deduplicates** shared struct definitions

### Core Types (schema_visitor.ts)

```typescript
type PrimitiveType = 'bool' | 'u8' | 'u16' | 'u32' | 'u64' | 'f64' | 'string' | 'bytes';

interface Type {
  kind: 'primitive' | 'vector' | 'array' | 'optional' | 'struct';
  primitive?: PrimitiveType;
  element?: Type;  // For vector, array, optional
  size?: number;   // For array
  struct?: Struct; // For struct types
}

interface Field {
  name: string;
  type: Type;
}

interface Struct {
  name: string;
  fields: Field[];
}

interface Command {
  name: string;
  fields: Field[];
  responseType: string;
}

interface CompiledSchema {
  structs: Map<string, Struct>;    // All unique struct types
  commands: Command[];              // Command → Response mappings
  responses: Map<string, Struct>;  // Response types
}
```

### Type Resolution Rules

1. **Primitive Optimization**: `vector<unsigned char>` → `bytes` (single primitive)
2. **Size-Based Array Handling**: Small arrays (≤32) → fixed, large → dynamic
3. **Pointer Dereferencing**: `shared_ptr<T>` → `T` (ownership implicit in target language)
4. **Nullable Types**: `optional<T>` → language-specific nullable representation

## Layer 2: Codegen Classes

### Codegen Interface

Each language codegen implements two methods:

```typescript
class LanguageCodegen {
  generateTypes(schema: CompiledSchema): string;  // Type definitions
  generateApi(schema: CompiledSchema): string;    // High-level API wrapper
}
```

### Codegen Responsibilities

Each codegen must handle:

1. **Type Mapping**: Schema types → language-specific types
2. **Serialization**: How to encode/decode msgpack (serde, custom, etc.)
3. **Memory Model**: Stack vs heap, ownership, lifetimes
4. **API Ergonomics**: Idiomatic parameter passing
5. **Error Handling**: Language-specific error patterns

### Language Feature Matrix

| Feature | Rust | Zig | Go | Python |
|---------|------|-----|-----|--------|
| Memory Model | Ownership | Manual | GC | GC |
| Nullable | `Option<T>` | `?T` | `*T` | `Optional[T]` |
| Bytes | `Vec<u8>` | `[]const u8` | `[]byte` | `bytes` |
| Arrays | `[T; N]` | `[N]T` | `[N]T` | `List[T]` |
| Vectors | `Vec<T>` | `[]T` | `[]T` | `List[T]` |
| Strings | `String` | `[]const u8` | `string` | `str` |
| Serialization | `serde` | `msgpack` | `encoding` | `msgpack` |

## Layer 3: Backend Abstraction

### Philosophy: Simplicity Over Complexity

We provide **two backend strategies**:

1. **PipeBackend**: Simple stdin/stdout IPC (default, recommended)
2. **Custom Backend Trait**: Users implement their own (FFI, WASM, etc.)

### Why Only Pipes?

- **Simplicity**: No filesystem, no socket files, no cleanup
- **Portability**: Works everywhere (Unix, Windows, WASM with polyfills)
- **Performance**: Sufficient for request-response pattern
- **Reliability**: OS manages buffering and backpressure

### Backend Trait

```rust
pub trait Backend {
    /// Send msgpack request, receive msgpack response
    fn call(&mut self, request: &[u8]) -> Result<Vec<u8>>;

    /// Cleanup resources
    fn destroy(&mut self) -> Result<()>;
}
```

### Custom Backend Examples

Users can implement:
- **FFI Backend**: Direct C bindings for maximum performance
- **HTTP Backend**: Remote BB server over network
- **WASM Backend**: Polyfill for browser/WASI
- **Mock Backend**: Testing without BB binary

## Code Generation Patterns

### Rust Generator Patterns

**Type Safety via Enums**:
```rust
pub enum Command {
    Blake2s(Blake2s),
    PedersenHash(PedersenHash),
    // ...
}

pub enum Response {
    Blake2sResponse(Blake2sResponse),
    PedersenHashResponse(PedersenHashResponse),
    // ...
}
```

**Serialization Strategy**: Custom serde implementation for Command/Response enums ensures correct msgpack format `["CommandName", {fields}]`.

**API Ergonomics**: Methods accept `&[u8]` but convert to `Vec<u8>` internally:
```rust
pub fn blake2s(&mut self, data: &[u8]) -> Result<Blake2sResponse> {
    let cmd = Command::Blake2s(Blake2s::new(data.to_vec()));
    // ...
}
```

### Zig Generator Patterns

**Union-Based Commands**:
```zig
pub const Command = union(enum) {
    blake2s: Blake2s,
    pedersen_hash: PedersenHash,
    // ...
};
```

**Allocator Threading**: Pass allocator through for memory management:
```zig
pub fn blake2s(self: *BarretenbergApi, allocator: Allocator, data: []const u8) !Blake2sResponse
```

**Slice Semantics**: Zig uses `[]const u8` for immutable byte slices, `[]T` for mutable slices.

## Extensibility

### Adding a New Language

1. Create `{language}_codegen.ts` with a class implementing `generateTypes()` and `generateApi()`
2. Implement type mapping logic
3. Implement serialization strategy
4. Add to `VISITOR_GENERATORS` in `generate.ts`
5. Done!

Example for Go:
```typescript
class GoCodegen {
  generateTypes(schema: CompiledSchema): string {
    // Generate Go struct definitions
  }

  generateApi(schema: CompiledSchema): string {
    // Generate Go API wrapper
  }

  private typeToGo(type: Type): string {
    // Map schema types to Go types
  }
}
```

## Testing Strategy

### Unit Tests (Per Generator)
- Type mapping correctness
- Serialization format validation
- Edge case handling

### Integration Tests (Per Language)
- End-to-end tests with real BB binary
- Verify all commands work
- Performance benchmarks

### Schema Evolution Tests
- Backward compatibility
- Forward compatibility with new commands

## Future Enhancements

### Potential Features
- **Async Support**: Async/await APIs for languages that support it
- **Streaming**: For large data transfers
- **Batching**: Multiple commands in single roundtrip
- **Schema Versioning**: Handle multiple BB versions

### Languages to Add
- **Go**: Popular in backend systems
- **Python**: Data science and ML workflows
- **C**: Maximum performance and integration
- **Swift**: iOS/macOS applications
- **JavaScript/WASM**: Browser support

## Conclusion

This architecture provides:
- ✅ **Maintainability**: Each layer has clear responsibilities
- ✅ **Extensibility**: New languages are straightforward
- ✅ **Correctness**: Type-safe compiled schema prevents errors
- ✅ **Simplicity**: Minimal backend surface area
- ✅ **Performance**: Efficient serialization strategies

The visitor-based design ensures that improvements to schema processing benefit all languages, while language-specific optimizations remain isolated in codegen classes.
