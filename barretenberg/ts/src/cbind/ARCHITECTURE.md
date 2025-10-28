# Barretenberg Multi-Language Code Generator Architecture

**Version**: 2.0
**Status**: Production
**Author**: Multi-language binding generator redesign

## Philosophy

This architecture embodies three core principles:

1. **Separation of Concerns**: Schema parsing, type normalization, and code emission are distinct layers
2. **Language Agnosticism**: The IR (Intermediate Representation) knows nothing about target languages
3. **Extensibility**: Adding a new language requires implementing one interface

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     BB Msgpack Schema                        │
│              (Raw JSON from bb binary)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  NORMALIZATION LAYER                         │
│                                                              │
│  SchemaProcessor: Raw Schema → Normalized IR                │
│  ├─ Type resolution & inference                             │
│  ├─ Naming convention normalization                         │
│  ├─ Recursive type discovery                                │
│  └─ Semantic validation                                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              INTERMEDIATE REPRESENTATION (IR)                │
│                                                              │
│  Language-agnostic type system:                             │
│  ├─ TypeIR: Composable type definitions                    │
│  ├─ StructIR: Product types with fields                    │
│  ├─ MethodIR: Functions with parameters                    │
│  └─ SchemaIR: Complete API definition                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   GENERATOR LAYER                            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │    Rust      │  │     Zig      │  │   Future     │     │
│  │  Generator   │  │  Generator   │  │  Languages   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  Each generator implements:                                 │
│  ├─ Type mapping (IR → language types)                     │
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

## Layer 1: Intermediate Representation (IR)

### Design Philosophy

The IR is the **contract** between schema parsing and code generation. It must be:
- **Complete**: Captures all semantic information from the schema
- **Normalized**: Consistent naming and structure regardless of input format
- **Composable**: Types can reference other types
- **Validated**: Semantic correctness guaranteed

### Core Types

```typescript
/**
 * TypeIR: Universal type representation
 *
 * Supports all common type system features:
 * - Primitives (bool, integers, floats, bytes)
 * - Collections (arrays, vectors, options)
 * - Product types (structs)
 * - Sum types (enums via custom)
 */
interface TypeIR {
  kind: 'primitive' | 'struct' | 'array' | 'vec' | 'option' | 'custom';
  name?: string;              // Type identifier
  elementType?: TypeIR;       // For parameterized types
  size?: number;              // For fixed-size arrays
  fields?: FieldIR[];         // For inline structs
}

/**
 * FieldIR: Struct field representation
 *
 * Preserves both original and normalized names for roundtrip serialization
 */
interface FieldIR {
  name: string;               // Normalized name (snake_case)
  originalName: string;       // Schema name (for serialization)
  type: TypeIR;
  doc?: string;
}

/**
 * StructIR: Product type definition
 */
interface StructIR {
  name: string;               // Normalized type name (PascalCase)
  originalName: string;       // Schema name (for serialization)
  fields: FieldIR[];
  isCommand: boolean;         // Commands need special serialization
  doc?: string;
}

/**
 * MethodIR: API function definition
 */
interface MethodIR {
  name: string;               // Normalized method name (snake_case)
  originalName: string;       // Schema name
  params: FieldIR[];
  returnType: string;         // Response type name
  doc?: string;
}

/**
 * SchemaIR: Complete API definition
 */
interface SchemaIR {
  structs: Map<string, StructIR>;
  commands: MethodIR[];
  primitiveTypes: Set<string>;
}
```

### Type Resolution Rules

1. **Primitive Optimization**: `vector<unsigned char>` → `bytes` (single primitive)
2. **Size-Based Array Handling**: Small arrays (≤32) → fixed, large → dynamic
3. **Pointer Dereferencing**: `shared_ptr<T>` → `T` (ownership implicit in target language)
4. **Nullable Types**: `optional<T>` → language-specific nullable representation

## Layer 2: Generator Abstraction

### Generator Interface

Every generator must implement:

```typescript
interface LanguageGenerator {
  /**
   * Generate complete bindings from IR
   *
   * @param ir - Complete normalized schema
   * @returns Object with generated code for each output file
   */
  generate(ir: SchemaIR): GeneratedCode;
}

interface GeneratedCode {
  types: string;    // Type definitions
  api: string;      // High-level API wrapper
}
```

### Generator Responsibilities

Each generator must handle:

1. **Type Mapping**: IR types → language-specific types
2. **Serialization**: How to encode/decode msgpack
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

1. Create `{language}_generator.ts` implementing `LanguageGenerator`
2. Implement type mapping logic
3. Implement serialization strategy
4. Add to `generate.ts` pipeline
5. Done!

Example for Go:
```typescript
class GoGenerator implements LanguageGenerator {
  generate(ir: SchemaIR): GeneratedCode {
    return {
      types: this.generateTypes(ir),
      api: this.generateAPI(ir),
    };
  }

  private typeToGo(type: TypeIR): string {
    // Map IR types to Go types
  }

  // ... rest of generator
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
- ✅ **Correctness**: Type-safe IR prevents errors
- ✅ **Simplicity**: Minimal backend surface area
- ✅ **Performance**: Efficient serialization strategies

The IR-based design ensures that improvements to schema processing benefit all languages, while language-specific optimizations remain isolated in generators.
