# IPC Schema Format Specification

This document specifies the JSON schema format used for cross-language code generation
in the IPC codegen system. The schema is the contract between a producer's
schema export command and all language code generators.

## Overview

Each IPC service exports its schema as JSON, typically via a subcommand:

```bash
./my-service msgpack schema   # Outputs JSON to stdout
```

The output is a JSON object representing the service's API, derived at compile time
from C++ type metadata via the `MsgpackSchemaPacker` infrastructure.

## Top-Level Structure

```json
{
  "commands": ["named_union", [
    ["CommandNameA", { "__typename": "CommandNameA", "field1": <type>, ... }],
    ["CommandNameB", { "__typename": "CommandNameB", "field1": <type>, ... }]
  ]],
  "responses": ["named_union", [
    ["ResponseNameA", { "__typename": "ResponseNameA", "field1": <type>, ... }],
    ["ErrorResponse", { "__typename": "ErrorResponse", "message": "string" }]
  ]]
}
```

- `commands` and `responses` are both **NamedUnion** types (see below).
- Commands and responses are positionally paired: the Nth command corresponds to the Nth
  non-error response. The error response (ending in `ErrorResponse`) is shared across all commands.

## Type Encodings

Types in the schema are represented as one of:

### Primitive Types (JSON strings)

| Schema String | C++ Type | Description |
|---------------|----------|-------------|
| `"bool"` | `bool` | Boolean |
| `"int"` | `int` | Signed 32-bit integer |
| `"unsigned int"` | `unsigned int` / `uint32_t` | Unsigned 32-bit integer |
| `"unsigned short"` | `unsigned short` / `uint16_t` | Unsigned 16-bit integer |
| `"unsigned long"` | `unsigned long` / `uint64_t` | Unsigned 64-bit integer |
| `"unsigned char"` | `unsigned char` / `uint8_t` | Unsigned 8-bit integer |
| `"double"` | `double` | 64-bit floating point |
| `"string"` | `std::string` | UTF-8 string |
| `"bin32"` | Fixed-size byte arrays | Raw binary data (e.g., field elements) |
| `"field2"` | `Fq2` | Extension field: pair of 32-byte field elements |
| `"MerkleTreeId"` | `MerkleTreeId` enum | C++ enum, serialized as uint32 |
| `"unordered_map"` | `std::unordered_map<K,V>` | Map type (special-cased per usage) |

### Container Types (JSON arrays)

Container types are encoded as 2-element arrays: `[kind, [args...]]`

#### `vector`
```json
["vector", [<element_type>]]
```
Example: `["vector", ["unsigned char"]]` = `std::vector<uint8_t>` = byte array

**Special case**: `["vector", ["unsigned char"]]` is treated as raw bytes, not an array of integers.

#### `array`
```json
["array", [<element_type>, <size>]]
```
Example: `["array", ["unsigned char", 32]]` = `std::array<uint8_t, 32>` = 32-byte fixed buffer

**Special case**: `["array", ["unsigned char", N]]` is treated as raw bytes (like `vector<uint8_t>`).

#### `optional`
```json
["optional", [<element_type>]]
```
Example: `["optional", ["string"]]` = `std::optional<std::string>`

#### `shared_ptr`
```json
["shared_ptr", [<element_type>]]
```
Treated as a transparent wrapper; the inner type is used directly.

#### `tuple`
```json
["tuple", [<type1>, <type2>, ...]]
```
Example: `["tuple", ["string", "unsigned long"]]` = `std::tuple<std::string, uint64_t>`

#### `alias`
```json
["alias", [<schema_name>, <msgpack_name>]]
```
Alias for a type that serializes as another msgpack type (e.g., `uint256_t` serializes as raw bytes).
Treated as raw bytes in code generation.

### Struct Types (JSON objects)

Structs are JSON objects with a `__typename` field and named fields:

```json
{
  "__typename": "SomeStruct",
  "field_a": "unsigned int",
  "field_b": ["vector", ["unsigned char"]],
  "field_c": {
    "__typename": "NestedStruct",
    "x": "unsigned long"
  }
}
```

- `__typename` identifies the struct for deduplication and named reference.
- Field names are the original C++ field names (snake_case by convention).
- Field values are type encodings (primitives, containers, or nested structs).
- Nested structs are inlined on first occurrence and referenced by `__typename` string thereafter.

### NamedUnion Type

```json
["named_union", [
  ["VariantName1", <type_schema_1>],
  ["VariantName2", <type_schema_2>]
]]
```

A tagged union where each variant has a string name and a type schema.
This is the top-level type for both `commands` and `responses`.

## Wire Protocol

The schema defines the types; this section specifies how they are serialized on the wire.

### Framing

All messages use length-prefix framing:

```
[4 bytes: payload length, little-endian uint32][payload: msgpack bytes]
```

### Request Wire Format

A request is a 1-element msgpack **array** containing a NamedUnion:

```
msgpack array(1) [
  msgpack array(2) [
    msgpack string: "CommandName",
    msgpack map: { field1: value1, field2: value2, ... }
  ]
]
```

In msgpack terms: `[[command_name, {fields...}]]`

The outer array (tuple wrapper) exists for extensibility. The inner 2-element array
is the NamedUnion encoding.

### Response Wire Format

A response is a NamedUnion (no tuple wrapper):

```
msgpack array(2) [
  msgpack string: "ResponseName" | "ErrorResponse",
  msgpack map: { field1: value1, field2: value2, ... }
]
```

If the response variant name ends with `ErrorResponse`, the response indicates an error.
The error struct always has a `message` field (string).

### NamedUnion Wire Encoding

A NamedUnion value is always encoded as a **2-element msgpack array**:
- Element 0: `string` — the variant name (matches `MSGPACK_SCHEMA_NAME` in C++)
- Element 1: `map` — the variant's fields, encoded as a msgpack map with string keys

### Struct Wire Encoding

Structs are encoded as msgpack **maps** with string keys matching the original C++ field names.
The `__typename` field from the schema is NOT included in the wire encoding — it is only
used for schema identification.

### Type Wire Encoding Summary

| Schema Type | msgpack Encoding |
|-------------|------------------|
| `bool` | msgpack bool |
| `unsigned int`, `int` | msgpack integer (smallest encoding that fits) |
| `unsigned short` | msgpack integer |
| `unsigned long` | msgpack integer |
| `unsigned char` | msgpack integer |
| `double` | msgpack float64 |
| `string` | msgpack str |
| `bin32`, `bytes` | msgpack bin |
| `vector<unsigned char>` | msgpack bin (NOT array of integers) |
| `array<unsigned char, N>` | msgpack bin |
| `vector<T>` | msgpack array |
| `array<T, N>` | msgpack array (fixed length) |
| `optional<T>` | msgpack nil (if absent) or value |
| `field2` | msgpack ext type or array of 2 bin values |
| `enum` | msgpack integer (uint32) |
| struct | msgpack map with string keys |
| NamedUnion | msgpack array(2): [string, map] |

### Integer Encoding Note

msgpack uses the **smallest encoding that fits the value**, not the declared type.
A `uint64_t` value of `5` encodes as a single byte (positive fixint), not as a
uint64 encoding. Decoders MUST accept any integer encoding width for any integer field.

## Schema Versioning

Schema compatibility can be validated by computing a SHA-256 hash of the raw JSON schema
output. This hash should be checked at connection time when possible. A mismatch indicates
that the service binary and client were generated from different schema versions.

## Adding a New Command

To add a new command to a service:

1. Define the command struct in C++ with `MSGPACK_SCHEMA_NAME` and `SERIALIZATION_FIELDS`
2. Add a nested `Response` struct with its own `MSGPACK_SCHEMA_NAME` and `SERIALIZATION_FIELDS`
3. Add both to the service's `Command` and `CommandResponse` NamedUnion types
4. Re-snapshot the schema JSON and re-run ipc-codegen for every target language
5. Verify generated code compiles in all target languages

## Source Files

- Schema visitor (IR compiler): `ipc-codegen/src/schema_visitor.ts`
- CLI entry point: `ipc-codegen/src/generate.ts`

The schema JSON is produced by the consumer's own C++ msgpack reflection (typically a `<binary> msgpack schema` subcommand that walks `SERIALIZATION_FIELDS` and `NamedUnion`s and prints the IR). ipc-codegen treats the resulting JSON as the source of truth and never reaches back into the producer.
