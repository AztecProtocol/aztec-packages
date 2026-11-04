# IPC Schema Format Specification

One hand-authored JSONC file per service defines its commands. ipc-codegen
generates wire types, client and server dispatch from it in TypeScript, C++, Rust
and Zig. `//` and `/* */` comments are allowed; they are stripped before parsing.
The committed golden msgpack corpus is the cross-language wire-format contract.

This spec covers the friendly form below. `generate.ts` still accepts a legacy
positional form (`{ commands, responses }` as `named_union` arrays, with no
`service` key). No in-tree schema uses it; `scripts/convert_schema.ts` converts
it to the friendly form.

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
`EchoAliases` response. Write the response name without the service prefix
(`"AliasesResponse"`, not `"EchoAliasesResponse"`). The referenced command must
appear earlier in `commands`.

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
- An alias's underlying type must be `bin32` or a primitive. `bytes` is a valid
  leaf type but not a valid alias underlying type.
- A fixed-array size (`T[N]`) must be a positive integer.
- Field names must not project (via the snake_case or camelCase mapping) to a
  reserved word in any target language, and two fields in one struct must not
  collapse to the same projected identifier.
- `--lang cpp` rejects structs with more than 20 fields (the C++ serialization
  macro limit). The other languages do not check, so keep schemas within 20
  fields so that every language can generate.

## Wire protocol

The schema defines the types; this section specifies how a value of each type
is serialized. The golden corpus pins these encodings across all languages.

### Framing

Framing (length prefix and request id) is added by ipc-runtime and is not part
of the payload; see [`ipc-runtime/README.md`](../ipc-runtime/README.md#wire-framing).

### Request wire format

A request is a 1-element msgpack array wrapping a `[name, payload]` pair:

```
array(1) [ array(2) [ str: "<service><Command>", map: { field: value, ... } ] ]
```

The dispatch tag is the generated command type name (e.g. `EchoBytes`). The
outer array must hold exactly one `[name, payload]` pair. Generated C++ and Zig
servers reject any other length. Generated TS and Rust servers reject an empty
array and ignore elements after the first.

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

## Schema versioning

Generated code exports `SCHEMA_HASH`, the SHA-256 of the schema file text
(comments included). The TS, Rust and Zig types files and the C++ client header
carry it. No runtime check uses it; a mismatch means the two sides were
generated from different schema versions.

## Adding a new command

1. Add an entry to `commands` with its `request`/`response` field maps (declare
   any new `types`/`aliases` it needs).
2. Re-run ipc-codegen for every target language and confirm everything compiles.
3. If the change alters the wire format, refresh the golden corpus
   (`(cd echo_example/rust && ./bootstrap.sh) && ./bootstrap.sh update_goldens`
   from `ipc-codegen/`) and review the byte-level diff — any
   change is breaking for external implementations of the schema.

## Source files

- Schema front-end + IR compiler: `ipc-codegen/src/schema_visitor.ts`
- CLI entry point: `ipc-codegen/src/generate.ts`
- Example schema: `ipc-codegen/echo_example/schema/schema.jsonc`
