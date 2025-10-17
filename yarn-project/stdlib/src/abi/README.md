# ABI Module

The ABI (Application Binary Interface) module provides essential functionality for encoding, decoding, and working with contract interfaces in the Aztec protocol. It enables type-safe interaction between TypeScript applications and Noir circuits.

## Overview

This module handles:

- **Selectors**: Compact identifiers for functions, events, notes, and authorizations
- **Encoding/Decoding**: Converting between TypeScript values and circuit field elements
- **Contract Artifacts**: Managing compiled contract metadata and ABIs
- **Type Definitions**: ABI type system matching Noir's type system

## Core Components

### Selectors

Selectors are 4-byte (or 7-bit for notes) identifiers derived from hashing signatures using Poseidon2.

#### FunctionSelector

Identifies functions within a contract:

```typescript
import { FunctionSelector } from '@aztec/stdlib';

// From signature
const selector = await FunctionSelector.fromSignature('transfer(field,field)');

// From ABI parameters
const selector = await FunctionSelector.fromNameAndParameters('transfer', [
  { name: 'to', type: { kind: 'field' }, visibility: 'private' },
  { name: 'amount', type: { kind: 'field' }, visibility: 'private' }
]);

// From hex string
const selector = FunctionSelector.fromString('0x12345678');
```

#### EventSelector

Identifies event types:

```typescript
import { EventSelector } from '@aztec/stdlib';

const selector = await EventSelector.fromSignature('Transfer(field,field,field)');
```

#### NoteSelector

Identifies note types (7-bit values, 0-127):

```typescript
import { NoteSelector } from '@aztec/stdlib';

const selector = NoteSelector.fromField(new Fr(42));
```

#### AuthorizationSelector

Identifies authorization payload types:

```typescript
import { AuthorizationSelector } from '@aztec/stdlib';

const selector = await AuthorizationSelector.fromSignature('CallAuthorization(field,field)');
```

### Encoding & Decoding

#### Encoding Arguments

Convert TypeScript values to field elements for circuit execution:

```typescript
import { encodeArguments } from '@aztec/stdlib';

const encoded = encodeArguments(functionAbi, [
  recipientAddress,    // AztecAddress or field
  new Fr(1000),       // amount
  [1, 2, 3]           // array
]);
// Returns: Fr[] - flattened field array
```

**Supported Types:**
- **Primitives**: `field`, `boolean`, `integer`
- **Strings**: Fixed-length strings
- **Arrays**: Fixed-length arrays
- **Structs**: Complex types with named fields
- **BoundedVec**: Dynamic arrays with maximum length
- **Special types**: AztecAddress, FunctionSelector, etc.

#### Decoding Results

Convert field elements back to TypeScript values:

```typescript
import { decodeFromAbi } from '@aztec/stdlib';

const result = decodeFromAbi(
  [{ kind: 'field' }],
  [new Fr(42)]
);
// Returns: 42n (bigint)

// Decode struct
const result = decodeFromAbi([{
  kind: 'struct',
  fields: [
    { name: 'x', type: { kind: 'field' } },
    { name: 'y', type: { kind: 'field' } }
  ]
}], [new Fr(1), new Fr(2)]);
// Returns: { x: 1n, y: 2n }
```

### Contract Artifacts

Contract artifacts contain all metadata needed to interact with a contract:

```typescript
import { loadContractArtifact, getFunctionArtifact } from '@aztec/stdlib';

// Load artifact from Nargo output
const artifact = loadContractArtifact(compiledContract);

// Get specific function
const fnArtifact = await getFunctionArtifact(artifact, 'transfer');

// Access function details
console.log(fnArtifact.name);           // 'transfer'
console.log(fnArtifact.functionType);   // 'private' | 'public' | 'utility'
console.log(fnArtifact.parameters);     // ABIParameter[]
console.log(fnArtifact.returnTypes);    // AbiType[]
console.log(fnArtifact.bytecode);       // Buffer
```

### Function Signatures

Generate signatures for display or selector computation:

```typescript
import {
  decodeFunctionSignature,
  decodeFunctionSignatureWithParameterNames
} from '@aztec/stdlib';

const params: ABIParameter[] = [
  { name: 'to', type: { kind: 'field' }, visibility: 'private' },
  { name: 'amount', type: { kind: 'integer', sign: 'unsigned', width: 64 },
    visibility: 'private' }
];

// Compact signature (for selectors)
const sig = decodeFunctionSignature('transfer', params);
// Returns: "transfer(field,u64)"

// Full signature (for display)
const fullSig = decodeFunctionSignatureWithParameterNames('transfer', params);
// Returns: "transfer(to: field, amount: u64)"
```

## Type System

The ABI type system mirrors Noir's type system:

### Basic Types

```typescript
type AbiType =
  | { kind: 'field' }
  | { kind: 'boolean' }
  | { kind: 'integer', sign: 'signed' | 'unsigned', width: number }
  | { kind: 'string', length: number }
  | ArrayType
  | StructType
  | TupleType;
```

### Complex Types

```typescript
// Array
{ kind: 'array', length: 10, type: { kind: 'field' } }

// Struct
{
  kind: 'struct',
  path: 'my_contract::MyStruct',
  fields: [
    { name: 'x', type: { kind: 'field' } },
    { name: 'y', type: { kind: 'field' } }
  ]
}

// Tuple
{ kind: 'tuple', fields: [{ kind: 'field' }, { kind: 'boolean' }] }
```

## Special Handling

### BoundedVec

BoundedVec structs can be passed as plain arrays:

```typescript
// Noir definition:
// struct BoundedVec<T, MaxLen> {
//   storage: [T; MaxLen],
//   len: u32
// }

// TypeScript usage - just pass an array!
const encoded = encodeArguments(abi, [
  [item1, item2, item3]  // Automatically converted to BoundedVec format
]);
```

### Custom Encoders

Structs can implement custom encoding:

```typescript
class MyType {
  constructor(public value: Fr) {}

  encodeToNoir(): Fr[] {
    // Custom encoding logic
    return [this.value];
  }
}
```

### Address Handling

Addresses are automatically detected and converted:

```typescript
// AztecAddress struct is automatically recognized
const encoded = encodeArguments(abi, [
  aztecAddress,  // Can be AztecAddress or raw field
]);
```

## Performance Considerations

### Selector Computation

Selector computation involves Poseidon2 hashing which is async:

```typescript
// Cache selectors when possible
const selector = await FunctionSelector.fromSignature('transfer(field,field)');

// Reuse selectors across calls
const cachedSelector = selector;
```

### Encoding Size

Calculate encoded size before encoding:

```typescript
import { countArgumentsSize } from '@aztec/stdlib';

const size = countArgumentsSize(functionAbi);
// Use size to pre-allocate buffers or validate inputs
```

## Best Practices

### 1. Use ABI Parameters Over Signatures

```typescript
// Preferred: Type-safe, works with artifacts
const selector = await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters);

// Avoid: Error-prone, manual string construction
const selector = await FunctionSelector.fromSignature('transfer(field,field)');
```

### 2. Validate Arguments Before Encoding

```typescript
// Check argument count
if (args.length !== abi.parameters.length) {
  throw new Error(`Expected ${abi.parameters.length} args, got ${args.length}`);
}

// Encoding will throw on type mismatch
const encoded = encodeArguments(abi, args);
```

### 3. Handle BoundedVec Constraints

```typescript
// BoundedVec has a maximum length
try {
  const encoded = encodeArguments(abi, [tooLargeArray]);
} catch (err) {
  // Error includes array preview and expected max length
  console.error(err.message);
}
```

### 4. Cache Contract Artifacts

```typescript
// Load once, use many times
const artifact = loadContractArtifact(compiled);

// Get functions as needed
const transferFn = await getFunctionArtifact(artifact, 'transfer');
const balanceFn = await getFunctionArtifact(artifact, 'balance_of');
```

## Error Handling

Common errors and how to handle them:

```typescript
// Selector: Signature with whitespace
try {
  await FunctionSelector.fromSignature('transfer(field, field)');
} catch (err) {
  // Error: Signature cannot contain whitespace
  // Fix: Remove spaces: 'transfer(field,field)'
}

// Encoding: Undefined argument
try {
  encodeArguments(abi, [undefined, value2]);
} catch (err) {
  // Error: Undefined argument amount of type field
  // Fix: Provide all required arguments
}

// Encoding: BoundedVec overflow
try {
  encodeArguments(abi, [[1, 2, 3, 4, 5, 6]]);
} catch (err) {
  // Error: expected an array of maximum length 5 and got 6 instead
  // Fix: Reduce array size or increase MaxLen in contract
}

// Decoding: Insufficient fields
try {
  decodeFromAbi([{ kind: 'field' }, { kind: 'field' }], [new Fr(1)]);
} catch (err) {
  // Error: Not enough return values
  // Fix: Ensure buffer has enough fields
}
```

## Related Modules

- **contract/**: Contract instances, classes, and deployment
- **aztec-address/**: Address types and utilities
- **keys/**: Cryptographic key management

## Additional Resources

- [Noir Language Documentation](https://noir-lang.org/)
- [Aztec Contract Development Guide](https://docs.aztec.network/)
- [ABI Encoding Specification](https://github.com/AztecProtocol/aztec-packages/blob/master/docs/docs/protocol-specs/abi-encoding.md)
