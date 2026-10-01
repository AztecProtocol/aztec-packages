# IPC Schema Format Specification

This document specifies the schema format used for cross-language code generation
in the IPC codegen system. A schema is a single hand-authored JSONC file per
service and is the source of truth: ipc-codegen reads it to generate the wire
types, client, and server dispatch for every target language (TypeScript, C++,
Rust, Zig). The committed golden msgpack corpus is the cross-language wire-format
contract; the schema is a normal reviewed source file.

JSONC is plain JSON with `//` and `/* */` comments stripped before parsing — no
extra dependencies.

## Top-level structure

A schema is a single object describing one service:

```jsonc
{
  "service": "Echo",

  // Named byte aliases — nominal 32-byte types. Only bin32 today.
  "aliases": {
    "Fr": "bin32"
  },

  // Shared struct types, referenced by name from commands or other types.
  "types": {
    "EchoInner": {
      "values": "bytes[]",
      "flag":   "bool?"
    }
  },

  // The error variant, declared once and shared by every command.
  "error": { "message": "string" },

  // command -> { request, response }.
  "commands": {
    "Bytes":   { "request":  { "data": "bytes" },
                 "response": { "data": "bytes" } },

    "Fields":  { "request":  { "a": "u32", "b": "u64", "name": "string" },
                 "response": { "a": "u32", "b": "u64", "name": "string" } },

    "Nested":  { "request":  { "inner": "EchoInner" },
                 "response": { "inner": "EchoInner" } },

    "Aliases": { "request":  { "treeId": "u32", "hash": "Fr",
                               "maybeHash": "Fr?", "hashes": "Fr[]" },
                 "response": { "treeId": "u32", "hash": "Fr",
                               "maybeHash": "Fr?", "hashes": "Fr[]" } },

    "Blobs":   { "request":  { "maybeData": "bytes?", "parts": "bytes[2]" },
                 "response": { "maybeData": "bytes?", "parts": "bytes[2]" } },

    "Fail":    { "request":  { "message": "string" },
                 "response": {} }
  }
}
```

### `service`

The service name. It is the prefix for generated **type** names and is *not*
included in **method** names:

- Command `Bytes` under `"service": "Echo"` generates the wire type `EchoBytes`
  and the response type `EchoBytesResponse`.
- The corresponding client method / server handler is the bare command name
  (`bytes` / `handle_bytes`), projected to each language's casing convention.

The error type is named `<service>ErrorResponse` (e.g. `EchoErrorResponse`).

### `aliases`

A map of alias name to underlying type. Two kinds:

- **Nominal byte alias** (`bin32`): a distinct named 32-byte value (e.g. `Fr` is
  a field element, not raw bytes). It carries its name as a dispatch tag and is
  generated as a distinct wrapper type per language. `bin32` is the only nominal
  byte width supported today.
- **Scalar synonym**: an alias whose underlying is a primitive (e.g.
  `MerkleTreeId: u32`). These are transparent — generated as plain type
  aliases — so consumers can `static_cast`/coerce them to and from the
  underlying integer or enum. Because they are transparent, declaring them is
  optional: a field may simply use the primitive (`u32`) directly.

### `types`

Named shared struct types, each a field-name → type-reference map. A type is
inlined at every reference and deduplicated by name, so it may be referenced
from multiple commands or from other `types`.

### `error`

The error struct, declared once. It must have exactly one field `message`
of type `string`. Generated servers wrap handler failures into this variant;
generated clients surface its `message`.

### `commands`

A map of command name to `{ request, response }`, where each of `request` and
`response` is a field-name → type-reference map. An empty object `{}` denotes a
command with no fields (e.g. a `Fail` command whose response carries nothing).

A `response` may instead be a **string** naming another command's response type
to reuse its shape — e.g. `"response": "AliasesResponse"` reuses the
`EchoAliases` response. Use the generated response type name (`<service><Command>Response`).

### `imports`

A list of schema paths, relative to this file, whose `aliases` and `types` are
merged into this schema. An import shares vocabulary between services and
nothing else: the imported file's `service`, `error` and `commands` are
ignored, so it may be a service schema or a file holding only `aliases` and
`types`. Imports resolve recursively.

```jsonc
{ "service": "Prover", "imports": ["../common/field_types.jsonc"], ... }
```

Imports exist so a type is defined once, not so generated code is shared: each
service's output still carries its own copy of every type it uses. Type names
carry no service prefix, so an imported type has the same name and the same
encoding in every service that imports it.

### `extends`

Makes this schema a strict superset of another service's contract:

```jsonc
{
  "extends": { "schema": "wsdb_base_schema.jsonc", "interface": "WsdbBase" },
  "commands": { "SyncBlock": { ... } }
}
```

The extending schema inherits the parent's `service`, `error`, `aliases`,
`types` and `commands`, and may add aliases, types and commands of its own. It
may not rename the service or change the error, since both are part of every
inherited wire tag. A server of the extended schema therefore accepts every
parent request unchanged, and a parent client can talk to it. `service` and
`error` may be omitted, or repeated verbatim.

`interface` names the parent's command set in generated code. TypeScript gets
`Async<interface>Api` and `Sync<interface>Api`, holding only the parent's
methods, and the full `AsyncApiBase`/`SyncApiBase` extend them. These are
structural, so code typed against `AsyncWsdbBaseApi` accepts the client of any
schema that extends the base, from any package. Chains are allowed. Each level
adds its own interface, and names must be unique along the chain.

Merge rules, shared by `imports` and `extends`:

- An alias or type may repeat an inherited definition only verbatim. The same
  type reached along two paths is one type. A different definition under the
  same name is an error.
- A command may never be redefined.
- A cycle between schema files is an error.

Output that ships the wire contract (the TS server binding package) ships the
merged schema as one self-contained file. A schema that uses neither key hashes
its own text as before. A merged schema hashes its merged form.

## Type-reference shorthand grammar

Every field type is a shorthand string. The grammar is a leaf type optionally
followed by suffixes, applied right to left:

| Suffix  | Meaning           |
|---------|-------------------|
| `T?`    | optional          |
| `T[]`   | vector of `T`     |
| `T[N]`  | fixed array of N  |

Suffixes compose, e.g. `Fr[]`, `bytes?`, `Fr[2]`, `EchoInner[]`.

Leaf types:

| Leaf            | Meaning                                  |
|-----------------|------------------------------------------|
| `bool`          | boolean                                  |
| `u8 u16 u32 u64`| unsigned 8/16/32/64-bit integers         |
| `f64`           | 64-bit float                             |
| `string`        | UTF-8 string                             |
| `bytes`         | variable-length byte string (msgpack bin)|
| `bin32`         | fixed 32-byte value (msgpack bin)        |
| alias name      | a declared `aliases` entry (e.g. `Fr`)   |
| type name       | a declared `types` entry (e.g. `EchoInner`) |

## Validation rules

Schemas are validated at generation time; violations are hard errors:

- `service` must be a non-empty string.
- The `error` struct must have exactly one field, `message: string`.
- Each command produces a matching `<command>Response`; the command and
  non-error response counts must agree.
- Command names must be unique.
- A type reference must resolve to a primitive, a declared alias, or a declared
  type.
- Field names must not project (via the snake_case or camelCase mapping) to a
  reserved word in any target language, and two fields in one struct must not
  collapse to the same projected identifier.
- A struct supports at most 20 fields (the C++ serialization macro limit).

## Wire protocol

The schema defines the types; this section specifies how a value of each type
is serialized. The golden corpus pins these encodings across all languages.

### Framing

Framing is owned by ipc-runtime, below this spec: every message travels as

```
[4 bytes: length, LE uint32][8 bytes: request id, LE uint64][payload: msgpack bytes]
```

where the length counts the id plus the payload. The request id is assigned
by the client and echoed on the response; responses arrive in completion
order and are correlated by id, entirely inside the transports — the msgpack
payloads this spec describes never contain the id, and generated code never
sees it.

### Request wire format

A request is a 1-element msgpack array wrapping a `[name, payload]` pair:

```
array(1) [ array(2) [ str: "<service><Command>", map: { field: value, ... } ] ]
```

The dispatch tag is the generated command type name (e.g. `EchoBytes`). The
outer array exists for extensibility.

### Response wire format

A response is a `[name, payload]` pair (no outer wrapper):

```
array(2) [ str: "<service><Command>Response" | "<service>ErrorResponse", map: { ... } ]
```

A response whose name is `<service>ErrorResponse` indicates an error; its
`message` field carries the text.

### Type wire encoding

| Schema type        | msgpack encoding                              |
|--------------------|-----------------------------------------------|
| `bool`             | bool                                          |
| `u8 u16 u32 u64`   | integer (smallest encoding that fits)         |
| `f64`              | float64                                       |
| `string`           | str                                           |
| `bytes`            | bin                                           |
| `bin32`            | bin (32 bytes)                                |
| `T?` (optional)    | nil if absent, else the encoding of `T`       |
| `T[]` (vector)     | array                                         |
| `T[N]` (array)     | array (fixed length)                          |
| alias              | same encoding as the alias's underlying type  |
| struct             | map with string keys (field names)            |

### Integer encoding note

msgpack uses the smallest encoding that fits the value, not the declared type:
a `u64` of `5` encodes as a single positive-fixint byte. Decoders MUST accept
any integer encoding width for any integer field.

### FFI entry

A service linked into its caller — a native library, or a wasm reactor — takes
requests through one exported C symbol instead of a transport:

```c
void  <svc>_ipc_ffi_entry(const uint8_t* input, size_t input_len,
                          uint8_t** output, size_t* output_len);
void* <svc>_ipc_ffi_alloc(size_t size);
void  <svc>_ipc_ffi_free(void* ptr);
```

`<svc>` is the schema's `service` in snake_case (`Bb` → `bb_ipc_ffi_entry`;
a positional schema uses the generator's type prefix, or the bare names when
there is none). The prefix is what lets several services be linked into one
binary. `input` is exactly the request payload above — no framing envelope,
since an in-process call has no transport — and `*output` receives the response
payload in a buffer from `<svc>_ipc_ffi_alloc()` that the caller releases with
`<svc>_ipc_ffi_free()` (both malloc/free-compatible). Input buffers the caller
hands over are allocated the same way when the caller lives outside the
module's memory (wasm). The entry is not thread-safe; callers serialize their
calls. `--server --ffi` generates it; the client side is the generated Rust/Zig
`ffi_backend` natively and `@aztec-foundation/ipc-runtime/wasm` for a wasm
module, which also expects a wasi reactor (`_initialize`, WASI imports,
wasi-threads `thread-spawn` for a threads build) and finds the entry by its
`_ipc_ffi_entry` suffix when not told its name.

## Schema versioning

A SHA-256 hash of the schema can be computed and embedded in generated code for
optional compatibility checking at connection time. A mismatch indicates the
service binary and client were generated from different schema versions.

## Adding a new command

1. Add an entry to `commands` with its `request`/`response` field maps (declare
   any new `types`/`aliases` it needs).
2. Re-run ipc-codegen for every target language and confirm everything compiles.
3. If the change alters the wire format, refresh the golden corpus
   (`./bootstrap.sh update_goldens`) and review the byte-level diff — any
   change is breaking for external implementations of the schema.

## Source files

- Schema front-end + IR compiler: `ipc-codegen/src/schema_visitor.ts`
- CLI entry point: `ipc-codegen/src/generate.ts`
- Example schema: `ipc-codegen/echo_example/schema/schema.jsonc`
