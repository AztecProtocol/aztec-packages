# AVM Opcode Documentation Generator (v2)

This directory contains the v2 implementation of the AVM Opcode Documentation Generator, which generates comprehensive JSON documentation for all AVM opcodes.

## Key Features (v2)

- **Programmatic Extraction**: Automatically extracts operands, wire formats, and addressing mode support from existing code
- **Minimal Manual Metadata**: Requires only expressions, descriptions, and error conditions to be specified manually
- **Semantic Types**: Uses OPCODE, ADDRMODE8, and ADDRMODE16 types for clearer wire format definitions
- **Correct Terminology**: Uses "addressing modes" instead of "indirect" to accurately represent the capability
- **Type-Safe**: Maintains full TypeScript type safety throughout

## Architecture

### Components

1. **InstructionAnalyzer** (`instruction_analyzer.ts`)
   - Extracts operands from wire formats and constructor parameters
   - Detects addressing mode support from naming conventions (`*Offset` parameters)
   - Discovers wire format variations from static properties
   - Calculates addressing mode bit allocations

2. **MinimalMetadataRegistry** (`../opcodes/metadata_registry.ts`)
   - Contains only information that cannot be extracted programmatically:
     - Expressions (mathematical/logical formulas)
     - Descriptions (human-readable explanations)
     - Error conditions
     - Optional overrides for inferred values

3. **DocumentationGenerator** (`generate_opcode_docs.ts`)
   - Combines extracted metadata with manual metadata
   - Generates JSON output with wire format diagrams
   - Includes gas cost information

### Semantic Operand Types

The v2 design introduces semantic types in the `OperandType` enum:

```typescript
export enum OperandType {
  // Size-based types (existing)
  UINT8, UINT16, UINT32, UINT64, UINT128, FF, TAG,

  // Semantic types (new in v2)
  OPCODE,      // Explicitly marks opcode bytes (serializes as UINT8)
  ADDRMODE8,   // 8-bit addressing mode bitmask for ALL offset operands (serializes as UINT8)
  ADDRMODE16,  // 16-bit addressing mode bitmask (reserved, serializes as UINT16)
}
```

These semantic types:
- Make wire formats self-documenting
- Enable automatic addressing mode detection
- Serialize to the same wire format as their base types (no breaking changes)

### Understanding Addressing Modes

**Critical Point**: Each instruction has **exactly ONE addressing mode byte**, not one per operand.

This single byte is a bitmask that encodes addressing modes for ALL offset operands:
- Each offset operand gets 2 bits in the bitmask
- Bit 0 (LSB): indirect flag
- Bit 1: relative flag

Example for ADD instruction with 3 offset operands:
```
ADDRMODE8 byte layout:
Bits 0-1: aOffset addressing mode
Bits 2-3: bOffset addressing mode
Bits 4-5: dstOffset addressing mode
Bits 6-7: Unused
```

## Usage

### Running the Generator

```bash
cd yarn-project/simulator
node --loader ts-node/esm src/public/avm/tools/generate_opcode_docs.ts [output-file]
```

Default output file: `opcode-docs.json`

### Adding a New Opcode

To add documentation for a new opcode, you only need to:

1. **Update the MinimalMetadataRegistry** in `opcodes/metadata_registry.ts`:

```typescript
export const MinimalMetadataRegistry: Record<string, MinimalOpcodeMetadata> = {
  // ... existing entries ...

  YOUR_OPCODE: {
    expression: 'M[dstOffset] = some_operation(M[aOffset])',
    description: 'Brief description of what this does',
    details: 'Longer explanation with constraints and behavior',
    errors: [
      { condition: 'ERROR_NAME', description: 'When this error occurs' },
    ],
    // Optional: override inferred category
    category: 'Arithmetic',
    // Optional: override inferred operand descriptions
    operandDescriptions: {
      aOffset: 'Custom description for this operand',
    },
  },
};
```

2. **Update the generator** in `generate_opcode_docs.ts`:
   - Add your instruction class to the `instructionClasses` array

Everything else is extracted automatically!

### Updating Wire Formats with Semantic Types

To use the new semantic types in your instruction classes:

```typescript
export class MyInstruction extends ThreeOperandInstruction {
  static readonly type = 'MYOP';
  static readonly opcode = Opcode.MYOP_8;

  // Use semantic types for clarity
  static readonly wireFormat8: OperandType[] = [
    OperandType.OPCODE,      // Opcode byte
    OperandType.ADDRMODE8,   // Single 8-bit addressing mode bitmask
    OperandType.UINT8,       // aOffset
    OperandType.UINT8,       // bOffset
    OperandType.UINT8,       // dstOffset
  ];

  static readonly wireFormat16: OperandType[] = [
    OperandType.OPCODE,      // Opcode byte
    OperandType.ADDRMODE8,   // Single 8-bit addressing mode bitmask
    OperandType.UINT16,      // aOffset
    OperandType.UINT16,      // bOffset
    OperandType.UINT16,      // dstOffset
  ];

  constructor(
    protected indirect: number,   // Addressing mode bitmask
    protected aOffset: number,
    protected bOffset: number,
    protected dstOffset: number,
  ) {
    super(indirect, aOffset, bOffset, dstOffset);
  }
}
```

### Naming Conventions for Automatic Detection

The InstructionAnalyzer uses these conventions:

1. **Addressing Mode Support**: Parameters ending with `Offset` are assumed to support addressing modes
2. **Operand Types**:
   - `*Offset` → `memory_offset`
   - Parameters containing 'value', 'const', or 'imm' → `immediate`
   - `OperandType.TAG` in wire format → `tag`
3. **Category Inference**: Can be specified in MinimalMetadataRegistry or defaults to 'Misc'

## Generated Output Format

The generator produces JSON with this structure:

```json
{
  "OPCODE_NAME": {
    "opcode": 0,
    "name": "OPCODE_NAME",
    "category": "Arithmetic",
    "gasCosts": {
      "l2Base": 12,
      "daBase": 0
    },
    "wireFormats": [
      {
        "name": "OPCODE_8",
        "opcode": 0,
        "format": ["OPCODE", "ADDRMODE8", "UINT8", "UINT8", "UINT8"],
        "mermaidDiagram": "..."
      }
    ],
    "operands": [
      {
        "name": "aOffset",
        "type": "memory_offset",
        "size": "variable",
        "description": "Memory offset",
        "supportsAddressingModes": true,
        "addressingModeBits": {
          "indirectBit": 0,
          "relativeBit": 1
        }
      }
    ],
    "expression": "M[dstOffset] = M[aOffset] + M[bOffset]",
    "description": "Adds two field elements",
    "details": "...",
    "errors": [...],
    "addressingModes": {
      "supported": true,
      "operands": ["aOffset", "bOffset", "dstOffset"],
      "bitmaskSize": 8,
      "encoding": "Single 8-bit bitmask: 2 bits per operand (indirect flag + relative flag)"
    }
  }
}
```

## Design Principles

1. **Convention Over Configuration**: Use consistent naming patterns to minimize manual work
2. **DRY (Don't Repeat Yourself)**: Extract information already present in code
3. **Type Safety**: Maintain TypeScript type safety throughout
4. **No Breaking Changes**: Semantic types serialize to same bytes as before
5. **Incremental Adoption**: Instructions can migrate to semantic types individually

## Migration from v1

The v2 design reduces the amount of manual metadata required. Key changes:

### Before (v1)
```typescript
static readonly metadata = {
  name: 'ADD',
  category: 'Arithmetic',
  operands: [
    { name: 'aOffset', type: 'memory_offset', size: 'variable', description: '...' },
    // ... manually specify all operands
  ],
  tagChecking: { /* ... */ },
  supportedWireFormats: ['wireFormat8', 'wireFormat16'],
  indirectSupport: { supported: true, operands: ['aOffset', 'bOffset', 'dstOffset'] },
};
```

### After (v2)
```typescript
// In MinimalMetadataRegistry only:
ADD: {
  expression: 'M[dstOffset] = M[aOffset] + M[bOffset]',
  description: 'Adds two field elements',
  errors: [{ condition: 'TAG_MISMATCH', description: '...' }],
}
// Everything else is extracted automatically!
```

## Categories

Available instruction categories:

- `Arithmetic` - Arithmetic operations (ADD, SUB, MUL, DIV, etc.)
- `Memory` - Memory operations (SET, MOV, etc.)
- `Control` - Control flow (JUMP, CALL, RETURN, etc.)
- `External` - External interactions (CALL, STATICCALL, etc.)
- `State` - State access (SLOAD, SSTORE, etc.)
- `Gadget` - Cryptographic gadgets (POSEIDON2, ECADD, etc.)
- `Comparison` - Comparison operations (EQ, LT, LTE, etc.)
- `Bitwise` - Bitwise operations (AND, OR, XOR, NOT, SHL, SHR, etc.)
- `Conversion` - Type conversions (CAST, TORADIXBE, etc.)
- `Environment` - Environment getters (GETENVVAR, etc.)
- `Misc` - Miscellaneous operations

## Benefits

1. **Less Manual Work**: ~80% reduction in manual metadata specification
2. **Stays Synchronized**: Documentation automatically reflects code changes
3. **Clearer Intent**: Semantic types make wire formats self-documenting
4. **Correct Terminology**: Uses "addressing modes" instead of misleading "indirect"
5. **Better Tooling**: InstructionAnalyzer can be reused for other purposes

## Validation

To validate generated documentation:

```bash
# Generate docs
node --loader ts-node/esm src/public/avm/tools/generate_opcode_docs.ts test-output.json

# Check specific opcode
cat test-output.json | jq '.ADD'

# List all documented opcodes
cat test-output.json | jq 'keys'

# Check addressing mode support
cat test-output.json | jq '.ADD.addressingModes'
```

## Troubleshooting

### "No minimal metadata found for X"

This warning means the opcode doesn't have an entry in `MinimalMetadataRegistry`. Add an entry or the opcode will be skipped.

### Operand names showing as "operand0", "operand1"

The constructor parameter extraction couldn't find parameter names. Make sure:
1. The instruction class or its parent has a constructor with named parameters
2. Parameters are not obfuscated by minification

### Addressing modes not detected

Check that:
1. The wire format includes `OperandType.ADDRMODE8` or `OperandType.ADDRMODE16`
2. Operands that support addressing modes have names ending with `Offset`

## Future Enhancements

Potential improvements for future versions:

1. Use TypeScript Compiler API for more robust parameter extraction
2. Analyze execute() methods to infer tag checking behavior
3. Extract error conditions from throw statements
4. Infer categories from file organization
5. Generate Mermaid diagrams with operand names instead of generic labels
6. Add validation to ensure addressing mode byte is used correctly

## Design Document

For complete design details, see:
`design-docs/avm-opcode-documentation-generator-v2.md` (from git root)
