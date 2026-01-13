/**
 * Minimal metadata registry for AVM opcodes (v2 design).
 * This file contains ONLY what cannot be extracted programmatically from code:
 * - Expressions (mathematical/logical formulas)
 * - Descriptions (human-readable explanations)
 * - Error conditions (documented errors)
 * - Details (additional explanatory notes)
 *
 * Everything else (operands, wire formats, addressing mode support, etc.)
 * is extracted programmatically by InstructionAnalyzer.
 */

/**
 * Represents an error condition that can occur during opcode execution.
 */
export interface ErrorCondition {
  /** Error condition identifier (e.g., 'TAG_MISMATCH', 'MEMORY_OUT_OF_BOUNDS') */
  condition: string;
  /** Human-readable description of when this error occurs */
  description: string;
}

/**
 * Instruction category for organizational purposes.
 */
export type InstructionCategory =
  | 'Arithmetic'
  | 'Memory'
  | 'Control'
  | 'External'
  | 'State'
  | 'Gadget'
  | 'Comparison'
  | 'Bitwise'
  | 'Conversion'
  | 'Environment'
  | 'Misc';

/**
 * Minimal metadata for an opcode - only what cannot be extracted programmatically.
 */
export interface MinimalOpcodeMetadata {
  /** Very brief summary (e.g., 'Addition (a + b)') */
  summary: string;
  /** Mathematical or logical expression representing the operation (e.g., 'M[dstOffset] = M[aOffset] + M[bOffset]') */
  expression: string;
  /** Brief one-line description of what the opcode does */
  description?: string;
  /** Detailed explanation of the opcode's behavior, constraints, and semantics */
  details?: string;
  /** List of error conditions that can occur during execution */
  errors?: ErrorCondition[];
  /** Additional notes or implementation-specific details */
  notes?: string[];
  /** Optional: Override inferred category */
  category?: InstructionCategory;
  /** Optional: Override inferred operand descriptions */
  operandDescriptions?: Record<string, string>;
  /** Tag checks performed by the instruction (e.g., '`T[aOffset] == T[bOffset]`') */
  tagChecks?: string[];
  /** Tag updates/assignments performed by the instruction (e.g., '`T[dstOffset] = T[aOffset]`') */
  tagUpdates?: string[];
  /** Gas scaling information for dynamic gas costs */
  gasScaling?: {
    l2Gas?: string; // What L2 dynamic gas scales with (e.g., "copySize")
    daGas?: string; // What DA dynamic gas scales with
    note?: string; // Optional note for unusual scaling behavior
  };
}

/**
 * Minimal metadata registry for all AVM opcodes.
 * Keys are the opcode type names (e.g., 'ADD', 'SUB', 'SET').
 * Only contains information that cannot be extracted programmatically.
 */
export const MinimalMetadataRegistry: Record<string, MinimalOpcodeMetadata> = {
  ADD: {
    summary: 'Addition (a + b)',
    expression: 'M[dstOffset] = M[aOffset] + M[bOffset]',
    details:
      'Performs addition. Both operands must have the same type tag. For integer types (UINT8, UINT16, UINT32, UINT64, UINT128), the operation is performed modulo 2^k where k is the bit-width (e.g., k=8 for UINT8). For FIELD type, the operation is performed modulo p (the BN254 field prime). The result inherits the tag from the operands.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of first input',
      bOffset: 'Memory offset of second input',
      dstOffset: 'Memory offset for result',
    },
    tagChecks: ['`T[aOffset] == T[bOffset]`'],
    tagUpdates: ['`T[dstOffset] = T[aOffset]`'],
  },

  SUB: {
    summary: 'Subtraction (a - b)',
    expression: 'M[dstOffset] = M[aOffset] - M[bOffset]',
    details:
      'Performs subtraction. Both operands must have the same type tag. For integer types (UINT8, UINT16, UINT32, UINT64, UINT128), the operation is performed modulo 2^k where k is the bit-width (e.g., k=8 for UINT8). For FIELD type, the operation is performed modulo p (the BN254 field prime). The result inherits the tag from the operands.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of the minuend',
      bOffset: 'Memory offset of the subtrahend',
      dstOffset: 'Memory offset for result',
    },
    tagChecks: ['`T[aOffset] == T[bOffset]`'],
    tagUpdates: ['`T[dstOffset] = T[aOffset]`'],
  },

  MUL: {
    summary: 'Multiplication (a * b)',
    expression: 'M[dstOffset] = M[aOffset] * M[bOffset]',
    details:
      'Performs multiplication. Both operands must have the same type tag. For integer types (UINT8, UINT16, UINT32, UINT64, UINT128), the operation is performed modulo 2^k where k is the bit-width (e.g., k=8 for UINT8). For FIELD type, the operation is performed modulo p (the BN254 field prime). The result inherits the tag from the operands.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of the first factor',
      bOffset: 'Memory offset of the second factor',
      dstOffset: 'Memory offset for result',
    },
    tagChecks: ['`T[aOffset] == T[bOffset]`'],
    tagUpdates: ['`T[dstOffset] = T[aOffset]`'],
  },

  DIV: {
    summary: 'Integer division (a / b)',
    expression: 'M[dstOffset] = M[aOffset] / M[bOffset]',
    details:
      'Performs integer division (truncating). Both operands must have the same integral type tag (not FIELD). The result inherits the tag from the operands.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'INVALID_TAG_TYPE', description: 'Operands are not integral types' },
      { condition: 'DIVISION_BY_ZERO', description: 'Second operand (divisor) is zero' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of the dividend',
      bOffset: 'Memory offset of the divisor',
      dstOffset: 'Memory offset for quotient',
    },
    tagChecks: ['`T[aOffset] == T[bOffset]`', '`T[aOffset] is integral`'],
    tagUpdates: ['`T[dstOffset] = T[aOffset]`'],
  },

  FDIV: {
    summary: 'Field division (a / b)',
    expression: 'M[dstOffset] = M[aOffset] / M[bOffset]',
    details:
      'Performs field division (computes a * b^(-1) mod p where p is the BN254 field modulus). Both operands must have FIELD type tag.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'INVALID_TAG_TYPE', description: 'Operands do not have FIELD type tag' },
      { condition: 'DIVISION_BY_ZERO', description: 'Second operand (divisor) is zero' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of the dividend',
      bOffset: 'Memory offset of the divisor',
      dstOffset: 'Memory offset for result',
    },
    tagChecks: ['`T[aOffset] == T[bOffset]`', '`T[aOffset] == FIELD`'],
    tagUpdates: ['`T[dstOffset] = FIELD`'],
  },

  SET: {
    summary: 'Set memory to immediate value',
    expression: 'M[dstOffset] = value',
    details:
      'Stores an immediate value (a constant encoded directly in the bytecode) at the specified memory offset with the given type tag. Multiple wire formats support different value sizes.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Specified tag is not a valid TypeTag' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      inTag: "Type tag to assign to the value. Unrelated to the opcode's wire format (`SET_8` vs `SET_16`, etc.)",
      value: 'Constant from the bytecode to store into memory',
      dstOffset: 'Memory offset for value will be stored',
    },
    tagChecks: [],
    tagUpdates: ['`T[dstOffset] = tag`'],
  },

  MOV: {
    summary: 'Move value between memory locations',
    expression: 'M[dstOffset] = M[srcOffset]',
    details: 'Copies a value and its type tag from the source memory offset to the destination offset.',
    errors: [
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      srcOffset: 'Memory offset to read from',
      dstOffset: 'Memory offset to write to',
    },
    tagChecks: [],
    tagUpdates: ['`T[dstOffset] = T[srcOffset]`'],
  },

  SHL: {
    summary: 'Shift left (a &lt;&lt; b)',
    expression: 'M[dstOffset] = M[aOffset] << M[bOffset]',
    details:
      'Performs left bit shift. Both operands must have the same integral type tag (UINT1, UINT8, UINT16, UINT32, UINT64, UINT128). The result is computed modulo 2^k where k is the bit-width of the operand type (e.g., k=8 for UINT8). If the shift amount is greater than or equal to the bit-width of the operand type, the result is 0. The result inherits the tag from the operands.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of the value to shift',
      bOffset: 'Memory offset of the shift amount',
      dstOffset: 'Memory offset for result',
    },
    tagChecks: ['`T[aOffset] == T[bOffset]`'],
    tagUpdates: ['`T[dstOffset] = T[aOffset]`'],
  },

  SHR: {
    summary: 'Shift right (a &gt;&gt; b)',
    expression: 'M[dstOffset] = M[aOffset] >> M[bOffset]',
    details:
      'Performs right bit shift (logical, zero-fill). Both operands must have the same integral type tag (UINT1, UINT8, UINT16, UINT32, UINT64, UINT128). If the shift amount is greater than or equal to the bit-width of the operand type, the result is 0. The result inherits the tag from the operands.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of the value to shift',
      bOffset: 'Memory offset of the shift amount',
      dstOffset: 'Memory offset for result',
    },
    tagChecks: ['`T[aOffset] == T[bOffset]`'],
    tagUpdates: ['`T[dstOffset] = T[aOffset]`'],
  },

  // Bitwise Operations
  AND: {
    summary: 'Bitwise AND (a &amp; b)',
    expression: 'M[dstOffset] = M[aOffset] & M[bOffset]',
    details:
      'Performs bitwise AND operation. Both operands must have the same integral type tag (UINT1, UINT8, UINT16, UINT32, UINT64, UINT128). The result inherits the tag from the operands.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'INVALID_TAG_TYPE', description: 'Operands are not integral types' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of first input',
      bOffset: 'Memory offset of second input',
      dstOffset: 'Memory offset for result',
    },
    tagChecks: ['`T[aOffset] == T[bOffset]`', '`T[aOffset] is integral`'],
    tagUpdates: ['`T[dstOffset] = T[aOffset]`'],
  },

  OR: {
    summary: 'Bitwise OR (a | b)',
    expression: 'M[dstOffset] = M[aOffset] | M[bOffset]',
    details:
      'Performs bitwise OR operation. Both operands must have the same integral type tag (UINT1, UINT8, UINT16, UINT32, UINT64, UINT128). The result inherits the tag from the operands.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'INVALID_TAG_TYPE', description: 'Operands are not integral types' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of first input',
      bOffset: 'Memory offset of second input',
      dstOffset: 'Memory offset for result',
    },
    tagChecks: ['`T[aOffset] == T[bOffset]`', '`T[aOffset] is integral`'],
    tagUpdates: ['`T[dstOffset] = T[aOffset]`'],
  },

  XOR: {
    summary: 'Bitwise XOR (a ^ b)',
    expression: 'M[dstOffset] = M[aOffset] ^ M[bOffset]',
    details:
      'Performs bitwise XOR operation. Both operands must have the same integral type tag (UINT1, UINT8, UINT16, UINT32, UINT64, UINT128). The result inherits the tag from the operands.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'INVALID_TAG_TYPE', description: 'Operands are not integral types' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of first input',
      bOffset: 'Memory offset of second input',
      dstOffset: 'Memory offset for result',
    },
    tagChecks: ['`T[aOffset] == T[bOffset]`', '`T[aOffset] is integral`'],
    tagUpdates: ['`T[dstOffset] = T[aOffset]`'],
  },

  NOT: {
    summary: 'Bitwise NOT (~a)',
    expression: 'M[dstOffset] = ~M[srcOffset]',
    details:
      "Performs bitwise NOT operation (one's complement). The operand must have an integral type tag (UINT1, UINT8, UINT16, UINT32, UINT64, UINT128). The result inherits the tag from the operand.",
    errors: [
      { condition: 'INVALID_TAG_TYPE', description: 'Operand is not an integral type' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      srcOffset: 'Memory offset of the value to negate',
      dstOffset: 'Memory offset for result',
    },
    tagChecks: ['`T[srcOffset] is integral`'],
    tagUpdates: ['`T[dstOffset] = T[srcOffset]`'],
  },

  // Comparison Operations
  EQ: {
    summary: 'Equality check (a == b)',
    expression: 'M[dstOffset] = (M[aOffset] == M[bOffset]) ? 1 : 0',
    details:
      'Compares two values for equality. Both operands must have the same type tag. The result is a Uint1 (0 or 1).',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of first value to compare',
      bOffset: 'Memory offset of second value to compare',
      dstOffset: 'Memory offset for result (0 or 1)',
    },
    tagChecks: ['`T[aOffset] == T[bOffset]`'],
    tagUpdates: ['`T[dstOffset] = UINT1`'],
  },

  LT: {
    summary: 'Less than (a &lt; b)',
    expression: 'M[dstOffset] = (M[aOffset] < M[bOffset]) ? 1 : 0',
    details:
      'Compares two values. Both operands must have the same type tag. For integer types, performs standard numeric comparison. For FIELD type, performs lexicographic comparison treating field elements as integers (0 < 1 < ... < p-1). The result is a Uint1 (0 or 1).',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of first value to compare',
      bOffset: 'Memory offset of second value to compare',
      dstOffset: 'Memory offset for result (0 or 1)',
    },
    tagChecks: ['`T[aOffset] == T[bOffset]`'],
    tagUpdates: ['`T[dstOffset] = UINT1`'],
  },

  LTE: {
    summary: 'Less than or equal (a &lt;= b)',
    expression: 'M[dstOffset] = (M[aOffset] <= M[bOffset]) ? 1 : 0',
    details:
      'Compares two values. Both operands must have the same type tag. For integer types, performs standard numeric comparison. For FIELD type, performs lexicographic comparison treating field elements as integers (0 < 1 < ... < p-1). The result is a Uint1 (0 or 1).',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of first value to compare',
      bOffset: 'Memory offset of second value to compare',
      dstOffset: 'Memory offset for result (0 or 1)',
    },
    tagChecks: ['`T[aOffset] == T[bOffset]`'],
    tagUpdates: ['`T[dstOffset] = UINT1`'],
  },

  CAST: {
    summary: 'Type cast memory value',
    expression: 'M[dstOffset] = M[srcOffset] as tag',
    details:
      'Changes the type tag of a value. The value itself is preserved if casting to a larger type. When casting to a smaller type, the value is truncated by keeping only the least significant bits that fit in the destination type (equivalent to modulo 2^k where k is the bit-width of the destination type).',
    errors: [
      { condition: 'INVALID_TAG', description: 'Destination tag is not a valid TypeTag' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      dstTag: 'Type tag to cast the value to',
      srcOffset: 'Memory offset of the value to cast',
      dstOffset: 'Memory offset for casted value',
    },
    tagChecks: [],
    tagUpdates: ['`T[dstOffset] = dstTag`'],
  },

  // Control Flow
  JUMP: {
    summary: 'Unconditional jump',
    expression: 'PC = jumpOffset',
    details:
      "Sets the program counter to the specified offset. The offset is an immediate value (not from memory). While this instruction itself does not validate the jump target, an invalid target will trigger an instruction fetching error at the start of the next instruction's processing.",
    errors: [],
    operandDescriptions: {
      jumpOffset: 'Immediate bytecode offset to jump to',
    },
    tagChecks: [],
    tagUpdates: [],
  },

  JUMPI: {
    summary: 'Conditional jump',
    expression: 'if M[condOffset] != 0 then PC = loc else PC = PC + instructionSize',
    details:
      "Jumps to the specified location if the condition is non-zero (true). The condition must have type tag Uint1. While this instruction itself does not validate the jump target, an invalid target will trigger an instruction fetching error at the start of the next instruction's processing.",
    errors: [
      { condition: 'INVALID_TAG', description: 'Condition operand is not Uint1' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      loc: 'Immediate bytecode offset to jump to if condition is true',
      condOffset: 'Memory offset of the condition value (Uint1)',
    },
    tagChecks: ['`T[condOffset] == UINT1`'],
    tagUpdates: [],
  },

  INTERNALCALL: {
    summary: 'Internal function call',
    expression: 'internalCallStack.push({callPc: PC, returnPc: PC + instructionSize}); PC = loc',
    details:
      "Pushes current PC and return PC onto internal call stack, then jumps to the target location. While this instruction itself does not validate the jump target, an invalid target will trigger an instruction fetching error at the start of the next instruction's processing.",
    errors: [],
    operandDescriptions: {
      loc: 'Immediate bytecode offset of the function to call',
    },
    tagChecks: [],
    tagUpdates: [],
  },

  INTERNALRETURN: {
    summary: 'Return from internal call',
    expression: 'PC = internalCallStack.pop().returnPc',
    details: 'Pops return PC from internal call stack and sets PC to it.',
    errors: [{ condition: 'INTERNAL_CALL_STACK_EMPTY', description: 'Internal call stack is empty' }],
    operandDescriptions: {},
    tagChecks: [],
    tagUpdates: [],
  },

  // Environment Operations
  GETENVVAR: {
    summary: 'Get environment variable',
    expression: 'M[dstOffset] = environmentVariable[varEnum]',
    details: `Retrieves environment variables from the currently executing context. The variable is specified by an immediate enum value.

## Variable Reference

| Index | Variable | Type | Description |
|-------|----------|------|-------------|
| 0 | \`ADDRESS\` | \`FIELD\` | Current executing contract address |
| 1 | \`SENDER\` | \`FIELD\` | Immediate caller of this context |
| 2 | \`TRANSACTIONFEE\` | \`FIELD\` | Total transaction fee |
| 3 | \`CHAINID\` | \`FIELD\` | Chain identifier |
| 4 | \`VERSION\` | \`FIELD\` | Protocol version |
| 5 | \`BLOCKNUMBER\` | \`UINT32\` | Current block number |
| 6 | \`TIMESTAMP\` | \`UINT64\` | Block timestamp |
| 7 | \`MINFEEPERL2GAS\` | \`UINT128\` | Minimum fee per L2 gas unit |
| 8 | \`MINFEEPERDAGAS\` | \`UINT128\` | Minimum fee per DA gas unit |
| 9 | \`ISSTATICCALL\` | \`UINT1\` | Whether current call is static (1) or not (0) |
| 10 | \`L2GASLEFT\` | \`UINT32\` | Remaining L2 gas at time of query |
| 11 | \`DAGASLEFT\` | \`UINT32\` | Remaining DA gas at time of query |`,
    errors: [
      { condition: 'INVALID_ENV_VAR', description: 'Env var enum is not in the range of valid enum values' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      varEnum: 'Immediate value specifying which environment variable to read',
    },
    tagChecks: [],
    tagUpdates: ['`T[dstOffset] = FIELD`'],
  },

  CALLDATACOPY: {
    summary: 'Copy calldata to memory',
    expression:
      'M[dstOffset:dstOffset+M[copySizeOffset]] = calldata[M[cdStartOffset]:M[cdStartOffset]+M[copySizeOffset]]',
    details:
      "Copies a section of the current call's calldata into memory at the specified offset. Reads M[copySizeOffset] elements starting at calldata offset M[cdStartOffset], writing them to memory starting at dstOffset. If the read extends past the end of calldata, the out-of-bounds region is padded with zeros. If the write would exceed addressable memory, the instruction errors.",
    errors: [
      { condition: 'INVALID_TAG', description: 'Size operand is not Uint32' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    notes: [
      'See [External Calls](../external-calls.md) for how calldata is passed to nested calls.',
      'See [Calldata and Return Data](../calldata-returndata.md) for more details.',
    ],
    operandDescriptions: {
      cdStartOffset: 'Memory offset of the calldata start index to copy from',
      copySizeOffset: 'Memory offset of the number of elements to copy',
      dstOffset: 'Memory offset for writing calldata',
    },
    tagChecks: ['`T[copySizeOffset] == UINT32`'],
    tagUpdates: ['`T[dstOffset:dstOffset+M[copySizeOffset]] = FIELD`'],
    gasScaling: {
      l2Gas: 'M[copySizeOffset]',
    },
  },

  RETURNDATASIZE: {
    summary: 'Get returndata size',
    expression: 'M[dstOffset] = nestedReturndata.length',
    details:
      "Returns the size of the return data from the most recent nested external call (CALL or STATICCALL instruction). The size is determined by the nested call's RETURN or REVERT instruction. If there has been no nested external call, or if the nested call truly errored (did not explicitly execute a REVERT instruction), this returns 0. Result is Uint32.",
    errors: [
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    notes: [
      'See [External Calls](../external-calls.md) for more details on nested calls.',
      'See [Calldata and Return Data](../calldata-returndata.md) for more details on return data.',
    ],
    operandDescriptions: {
      dstOffset: 'Memory offset for size will be written',
    },
    tagChecks: [],
    tagUpdates: ['`T[dstOffset] = UINT32`'],
  },

  RETURNDATACOPY: {
    summary: 'Copy returndata to memory',
    expression:
      'M[dstOffset:dstOffset+M[copySizeOffset]] = nestedReturndata[M[rdStartOffset]:M[rdStartOffset]+M[copySizeOffset]]',
    details:
      'Copies a section of the returndata from the most recent nested external call (CALL or STATICCALL instruction) into memory. Reads M[copySizeOffset] elements starting at return data offset M[rdStartOffset], writing them to memory starting at dstOffset. If the read extends past the end of return data, the out-of-bounds region is padded with zeros. If the write would exceed addressable memory, the instruction errors.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Size operand is not Uint32' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    notes: [
      'See [External Calls](../external-calls.md) for more details on nested calls.',
      'See [Calldata and Return Data](../calldata-returndata.md) for more details on return data.',
    ],
    operandDescriptions: {
      rdStartOffset: 'Memory offset of the return data start index to copy from',
      copySizeOffset: 'Memory offset of the number of elements to copy',
      dstOffset: 'Memory offset for writing return data',
    },
    tagChecks: ['`T[copySizeOffset] == UINT32`'],
    tagUpdates: ['`T[dstOffset:dstOffset+M[copySizeOffset]] = FIELD`'],
    gasScaling: {
      l2Gas: 'M[copySizeOffset]',
    },
  },

  SUCCESSCOPY: {
    summary: 'Get success status of latest external call',
    expression: 'M[dstOffset] = nestedCallSuccess ? 1 : 0',
    details:
      'Returns 1 if the most recent nested external call (CALL or STATICCALL instruction) succeeded, 0 if it reverted. Result is Uint1.',
    errors: [
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    notes: ['See [External Calls](../external-calls.md) for more details on nested calls and success handling.'],
    operandDescriptions: {
      dstOffset: 'Memory offset for success status (0 or 1) will be written',
    },
    tagChecks: [],
    tagUpdates: ['`T[dstOffset] = UINT1`'],
  },

  // Storage Operations
  SLOAD: {
    summary: 'Load value from public storage',
    expression: 'M[dstOffset] = storage[contractAddress][M[slotOffset]]',
    details:
      'Reads from public storage at the specified slot. Performs a read of the Public Data Tree. The contractAddress is the address of the currently executing contract and does not come from the bytecode. Both slot and result have type tag FIELD. Gas cost varies based on whether the slot is warm (recently accessed) or cold (first access in this transaction).',
    errors: [
      { condition: 'INVALID_TAG', description: 'Slot operand is not FIELD' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      slotOffset: 'Memory offset of the storage slot to read from',
      dstOffset: 'Memory offset for loaded value will be written',
    },
    tagChecks: ['`T[slotOffset] == FIELD`'],
    tagUpdates: ['`T[dstOffset] = FIELD`'],
  },

  SSTORE: {
    summary: 'Store value to public storage',
    expression: 'storage[contractAddress][M[slotOffset]] = M[srcOffset]',
    details:
      'Writes to public storage at the specified slot. Performs a write to the Public Data Tree. The contractAddress is the address of the currently executing contract and does not come from the bytecode. Both slot and value must have type tag FIELD. Gas cost varies based on whether the slot is warm (recently accessed) or cold (first access in this transaction). Reverts in static calls.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Slot or value operand is not FIELD' },
      { condition: 'STATIC_CALL_ALTERATION', description: 'Attempted storage write in static call context' },
      {
        condition: 'SIDE_EFFECT_LIMIT_REACHED',
        description: 'Exceeded maximum public data updates per transaction (MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX)',
      },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      srcOffset: 'Memory offset of the value to store',
      slotOffset: 'Memory offset of the storage slot to write to',
    },
    tagChecks: ['`T[slotOffset] == FIELD`', '`T[srcOffset] == FIELD`'],
    tagUpdates: [],
  },

  // World State Operations
  NOTEHASHEXISTS: {
    summary: 'Check existence of note hash',
    expression: 'M[existsOffset] = noteHashTree.exists(M[noteHashOffset], M[leafIndexOffset]) ? 1 : 0',
    details:
      'Performs a read of the Note Hash Tree to query whether the specified note hash exists at the given leaf index. Since this opcode checks for existence at a specified leafIndex, it is _not_ limited to checking for note hashes of only the currently executing contract. Note that it is difficult to check for existence of a note hash emitted earlier in the same block because this opcode requires leafIndex. If the leaf index exceeds the maximum tree size, the result is 0 (does not exist). Note hash must be FIELD, leaf index must be Uint64. Result is Uint1.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Note hash is not FIELD or leaf index is not Uint64' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      noteHashOffset: 'Memory offset of the note hash to check',
      leafIndexOffset: 'Memory offset of the leaf index in the note hash tree',
      existsOffset: 'Memory offset for result (0 or 1) will be written',
    },
    tagChecks: ['`T[noteHashOffset] == FIELD`', '`T[leafIndexOffset] == UINT64`'],
    tagUpdates: ['`T[existsOffset] = UINT1`'],
  },

  EMITNOTEHASH: {
    summary: 'Emit note hash',
    expression: 'noteHashes.append(M[noteHashOffset])',
    details:
      'Writes a new note hash to the Note Hash Tree. Note hash must have type tag FIELD. Reverts in static calls.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Note hash operand is not FIELD' },
      { condition: 'STATIC_CALL_ALTERATION', description: 'Attempted note hash emission in static call context' },
      {
        condition: 'SIDE_EFFECT_LIMIT_REACHED',
        description: 'Exceeded maximum note hashes per transaction (MAX_NOTE_HASHES_PER_TX)',
      },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      noteHashOffset: 'Memory offset of the note hash to emit',
    },
    tagChecks: ['`T[noteHashOffset] == FIELD`'],
    tagUpdates: [],
  },

  NULLIFIEREXISTS: {
    summary: 'Check existence of nullifier',
    expression: 'M[existsOffset] = nullifierTree.exists(M[addressOffset], M[nullifierOffset]) ? 1 : 0',
    details:
      'Performs a read of the Nullifier Tree to query whether the specified nullifier exists for the given contract address. Any contract address can be specified, not just the currently executing contract. Both address and nullifier must be FIELD. Result is Uint1.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Address or nullifier is not FIELD' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      nullifierOffset: 'Memory offset of the nullifier to check',
      addressOffset: 'Memory offset of the contract address',
      existsOffset: 'Memory offset for result (0 or 1) will be written',
    },
    tagChecks: ['`T[addressOffset] == FIELD`', '`T[nullifierOffset] == FIELD`'],
    tagUpdates: ['`T[existsOffset] = UINT1`'],
  },

  EMITNULLIFIER: {
    summary: 'Emit nullifier',
    expression: 'nullifiers.append(M[nullifierOffset])',
    details:
      'Writes a new nullifier to the Nullifier Tree. This opcode can only emit nullifiers from the currently executing contract address. Nullifier must have type tag FIELD. Reverts in static calls or if nullifier already exists.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Nullifier operand is not FIELD' },
      { condition: 'STATIC_CALL_ALTERATION', description: 'Attempted nullifier emission in static call context' },
      { condition: 'NULLIFIER_COLLISION', description: 'Nullifier already exists' },
      {
        condition: 'SIDE_EFFECT_LIMIT_REACHED',
        description: 'Exceeded maximum nullifiers per transaction (MAX_NULLIFIERS_PER_TX)',
      },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      nullifierOffset: 'Memory offset of the nullifier to emit',
    },
    tagChecks: ['`T[nullifierOffset] == FIELD`'],
    tagUpdates: [],
  },

  L1TOL2MSGEXISTS: {
    summary: 'Check existence of L1-to-L2 message',
    expression: 'M[existsOffset] = l1ToL2Messages.exists(M[msgHashOffset], M[msgLeafIndexOffset]) ? 1 : 0',
    details:
      'Checks whether the specified L1-to-L2 message hash exists in the L1 to L2 message tree at the given leaf index. Since this opcode checks for existence at a specified leafIndex, it is _not_ limited to checking for messages with any particular recipient. If the leaf index exceeds the maximum tree size, the result is 0 (does not exist). Message hash must be FIELD, leaf index must be Uint64. Result is Uint1.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Message hash is not FIELD or leaf index is not Uint64' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      msgHashOffset: 'Memory offset of the L1-to-L2 message hash',
      msgLeafIndexOffset: 'Memory offset of the leaf index in the message tree',
      existsOffset: 'Memory offset for result (0 or 1) will be written',
    },
    tagChecks: ['`T[msgHashOffset] == FIELD`', '`T[msgLeafIndexOffset] == UINT64`'],
    tagUpdates: ['`T[existsOffset] = UINT1`'],
  },

  GETCONTRACTINSTANCE: {
    summary: 'Get contract instance information',
    expression: 'M[dstOffset] = contractInstance.exists ? 1 : 0; M[dstOffset+1] = contractInstance[memberEnum]',
    details: `Looks up contract instance by address and retrieves the specified member. This opcode can get contract instance information for any contract address, not just the currently executing one. Returns existence flag (Uint1) and member value (FIELD). If the contract does not exist, the member value is set to 0. Supported enum values: \`[DEPLOYER=0, CLASS_ID, INIT_HASH]\`.

## Contract Classes and Instances

In Aztec, the logic of a contract is separated from its state-bearing instance, enabling a powerful model for code reuse and upgradeability. This is different from Ethereum's model where code and state are tightly coupled in a single address.

- **Contract Class**: A template that defines a contract's public and private functions, its storage layout, and other logic. It is identified by a \`CLASS_ID\`. A single contract class can be used by many different contract instances.
- **Contract Instance**: A deployed, stateful instance of a contract class at a specific address. Each instance has its own storage, but it executes the code of its associated contract class.

This separation allows for:
- **Upgradeability**: An instance can be upgraded to point to a new contract class, changing its logic while preserving its state and address.
- **Code Reuse**: Multiple instances can share the same underlying code from a single class, which is more efficient.

## Contract Instance Members

| Member | Description |
|---|---|
| **Deployer Address** | The address of the account that deployed this contract instance. |
| **Class ID** | The identifier of the contract class that this instance uses for its code. |
| **Initialization Hash** | A hash of the constructor arguments used when the contract instance was deployed. |

**Example**: To check if a contract at a given \`address\` is an instance of a known \`CLASS_ID\`:
1. Use \`GETCONTRACTINSTANCE\` with the \`address\` and the \`CLASS_ID\` member enum.
2. The opcode returns two values: an \`exists\` flag and the \`class_id\` of the instance.
3. Compare the returned \`class_id\` with the known \`CLASS_ID\`.`,
    errors: [
      { condition: 'INVALID_TAG', description: 'Address operand is not FIELD' },
      { condition: 'INVALID_MEMBER_ENUM', description: 'Member enum is not in the range of valid enum values' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      memberEnum: 'Immediate value specifying which contract instance member to retrieve',
    },
    tagChecks: [],
    tagUpdates: ['`T[dstOffset] = UINT1`', '`T[dstOffset+1] = FIELD`'],
  },

  EMITUNENCRYPTEDLOG: {
    summary: 'Emit public log',
    expression: 'unencryptedLogs.append(M[logOffset:logOffset+M[logSizeOffset]])',
    details:
      'Emits a public log from the currently executing contract. Log size must be Uint32, log data must be FIELD elements. Reverts in static calls.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Log size is not Uint32 or log data is not FIELD' },
      { condition: 'STATIC_CALL_ALTERATION', description: 'Attempted log emission in static call context' },
      {
        condition: 'SIDE_EFFECT_LIMIT_REACHED',
        description: 'Exceeded maximum cumulative log size per transaction (FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH)',
      },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      logOffset: 'Memory offset of the start of the log data',
      logSizeOffset: 'Memory offset of the log size (number of fields)',
    },
    tagChecks: ['`T[logSizeOffset] == UINT32`', '`T[logOffset:logOffset+M[logSizeOffset]]` == FIELD'],
    tagUpdates: [],
    gasScaling: {
      l2Gas: 'M[logSizeOffset]',
      daGas: 'M[logSizeOffset]',
    },
  },

  SENDL2TOL1MSG: {
    summary: 'Send L2-to-L1 message',
    expression: 'l2ToL1Messages.append({recipient: M[recipientOffset], content: M[contentOffset]})',
    details:
      'Sends a message to L1, with the specified recipient, from the currently executing contract. Both recipient and content must have type tag FIELD. Reverts in static calls.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Recipient or content is not FIELD' },
      { condition: 'STATIC_CALL_ALTERATION', description: 'Attempted L2-to-L1 message send in static call context' },
      {
        condition: 'SIDE_EFFECT_LIMIT_REACHED',
        description: 'Exceeded maximum L2-to-L1 messages per transaction (MAX_L2_TO_L1_MSGS_PER_TX)',
      },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      recipientOffset: 'Memory offset of the L1 recipient address',
      contentOffset: 'Memory offset of the message content',
    },
    tagChecks: ['`T[recipientOffset] == FIELD`', '`T[contentOffset] == FIELD`'],
    tagUpdates: [],
  },

  // External Call Operations
  CALL: {
    summary: 'Call external contract',
    expression: `nestedCallResult = executeContract(
        /*address=*/M[addrOffset],
        /*args=*/M[argsOffset:argsOffset+M[argsSizeOffset]],
        {l2Gas: M[l2GasOffset], daGas: M[daGasOffset]}
    )`,
    details:
      'Calls another contract with the specified calldata and gas allocation. Can modify state. The call consumes the allocated gas and refunds unused gas. Updates nestedCallSuccess and nestedReturndata.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Gas, address, or size operands have incorrect tags' },
      { condition: 'OUT_OF_GAS', description: 'Insufficient gas for the nested call' },
      {
        condition: 'SIDE_EFFECT_LIMIT_REACHED',
        description:
          'Exceeded maximum unique contract class IDs per transaction (MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS)',
      },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    notes: [
      'See [External Calls](../external-calls.md) for more details on execution flow.',
      'See [Calldata and Return Data](../calldata-returndata.md) for more details on passing data.',
    ],
    operandDescriptions: {
      l2GasOffset: 'Memory offset of the L2 gas to allocate to the nested call',
      daGasOffset: 'Memory offset of the DA gas to allocate to the nested call',
      addrOffset: 'Memory offset of the target contract address',
      argsOffset: 'Memory offset of the start of the calldata',
      argsSizeOffset: 'Memory offset of the calldata size',
      successOffset: 'Memory offset where success flag (0 or 1) will be written',
    },
    tagChecks: [
      '`T[l2GasOffset] == UINT32`',
      '`T[daGasOffset] == UINT32`',
      '`T[addrOffset] == FIELD`',
      '`T[argsSizeOffset] == UINT32`',
    ],
    tagUpdates: ['`T[successOffset] = UINT1`'],
  },

  STATICCALL: {
    summary: 'Static call to external contract',
    expression: `nestedCallResult = executeContractStatic(
        /*address=*/M[addrOffset],
        /*args=*/M[argsOffset:argsOffset+M[argsSizeOffset]],
        {l2Gas: M[l2GasOffset], daGas: M[daGasOffset]}
    )`,
    details:
      'Calls another contract in static mode (read-only). Any state modifications in the nested call will cause it to revert. Updates nestedCallSuccess and nestedReturndata.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Gas, address, or size operands have incorrect tags' },
      { condition: 'OUT_OF_GAS', description: 'Insufficient gas for the nested call' },
      {
        condition: 'SIDE_EFFECT_LIMIT_REACHED',
        description:
          'Exceeded maximum unique contract class IDs per transaction (MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS)',
      },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    notes: [
      'See [External Calls](../external-calls.md) for more details on execution flow.',
      'See [Calldata and Return Data](../calldata-returndata.md) for more details on passing data.',
    ],
    operandDescriptions: {
      l2GasOffset: 'Memory offset of the L2 gas to allocate to the nested call',
      daGasOffset: 'Memory offset of the DA gas to allocate to the nested call',
      addrOffset: 'Memory offset of the target contract address',
      argsOffset: 'Memory offset of the start of the calldata',
      argsSizeOffset: 'Memory offset of the calldata size',
      successOffset: 'Memory offset where success flag (0 or 1) will be written',
    },
    tagChecks: [
      '`T[l2GasOffset] == UINT32`',
      '`T[daGasOffset] == UINT32`',
      '`T[addrOffset] == FIELD`',
      '`T[argsSizeOffset] == UINT32`',
    ],
    tagUpdates: ['`T[successOffset] = UINT1`'],
  },

  RETURN: {
    summary: 'Return from call',
    expression: 'return M[returnOffset:returnOffset+M[returnSizeOffset]]; halt',
    details: 'Halts execution and returns data to the caller. Return size must be Uint32. Sets success flag.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Return size operand is not Uint32' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    notes: [
      'See [External Calls](../external-calls.md) for more details on execution flow.',
      'See [Calldata and Return Data](../calldata-returndata.md) for more details on passing data.',
    ],
    operandDescriptions: {
      returnOffset: 'Memory offset of the start of the return data',
      returnSizeOffset: 'Memory offset of the return data size',
    },
    tagChecks: ['`T[returnSizeOffset] == UINT32`'],
    tagUpdates: [],
  },

  REVERT: {
    summary: 'Revert execution',
    expression: 'revert M[returnOffset:returnOffset+M[retSizeOffset]]; halt',
    details:
      'Halts execution with revert status and returns error data to the caller. Revert size must be Uint32. Undoes state changes.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Revert size operand is not Uint32' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    notes: [
      'See [External Calls](../external-calls.md) for more details on execution flow.',
      'See [Calldata and Return Data](../calldata-returndata.md) for more details on passing data.',
    ],
    operandDescriptions: {
      returnOffset: 'Memory offset of the start of the revert data',
      retSizeOffset: 'Memory offset of the revert data size',
    },
    tagChecks: ['`T[retSizeOffset] == UINT32`'],
    tagUpdates: [],
  },

  // Gadget Operations
  POSEIDON2: {
    summary: 'Poseidon2 permutation',
    expression:
      'M[outputStateOffset:outputStateOffset+4] = poseidon2Permutation(/*input=*/M[inputStateOffset:inputStateOffset+4])',
    details:
      'Computes the Poseidon2 permutation on a state of 4 field elements. Input and output states must have type tag FIELD.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Input state elements are not FIELD' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      inputStateOffset: 'Memory offset of the input state (4 field elements)',
      outputStateOffset: 'Memory offset for output state will be written',
    },
    tagChecks: ['`T[inputStateOffset:inputStateOffset+4] == FIELD`'],
    tagUpdates: ['`T[outputStateOffset:outputStateOffset+4] = FIELD`'],
  },

  SHA256COMPRESSION: {
    summary: 'SHA-256 compression',
    expression:
      'M[outputOffset:outputOffset+8] = sha256compress(/*state=*/M[stateOffset:stateOffset+8], /*inputs=*/M[inputsOffset:inputsOffset+16])',
    details:
      'Computes the SHA-256 compression function on an 8-word state and 16-word input block. State and inputs must be Uint32. Outputs 8 Uint32 words.',
    errors: [
      { condition: 'INVALID_TAG', description: 'State or inputs are not Uint32' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      stateOffset: 'Memory offset of the 8-word SHA-256 state',
      inputsOffset: 'Memory offset of the 16-word input block',
      outputOffset: 'Memory offset for 8-word output state will be written',
    },
    tagChecks: ['`T[stateOffset:stateOffset+8] == UINT32`', '`T[inputsOffset:inputsOffset+16] == UINT32`'],
    tagUpdates: ['`T[outputOffset:outputOffset+8] = UINT32`'],
  },

  KECCAKF1600: {
    summary: 'Keccak-f[1600] permutation',
    expression: 'M[dstOffset:dstOffset+25] = keccakf1600(/*input=*/M[inputOffset:inputOffset+25])',
    details:
      'Computes the Keccak-f[1600] permutation on a state of 25 Uint64 elements. Input and output must have type tag Uint64.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Input state elements are not Uint64' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      inputOffset: 'Memory offset of the input state (25 Uint64 elements)',
      dstOffset: 'Memory offset for output state will be written',
    },
    tagChecks: ['`T[inputOffset:inputOffset+25] == UINT64`'],
    tagUpdates: ['`T[dstOffset:dstOffset+25] = UINT64`'],
  },

  ECADD: {
    summary: 'Grumpkin elliptic curve addition',
    expression: `M[dstOffset:dstOffset+3] = grumpkinAdd(
        /*point1=*/{x: M[p1XOffset], y: M[p1YOffset], isInfinite: M[p1IsInfiniteOffset]},
        /*point2=*/{x: M[p2XOffset], y: M[p2YOffset], isInfinite: M[p2IsInfiniteOffset]}
    )`,
    details:
      'Performs elliptic curve point addition on the Grumpkin curve. Each point is represented as (x: FIELD, y: FIELD, isInfinite: Uint1). Returns result point in same format.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Point coordinates are not FIELD or infinity flags are not Uint1' },
      { condition: 'POINT_NOT_ON_CURVE', description: 'One or both points are not on the Grumpkin curve' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      p1XOffset: "Memory offset of the first point's x-coordinate",
      p1YOffset: "Memory offset of the first point's y-coordinate",
      p1IsInfiniteOffset: "Memory offset of the first point's infinity flag",
      p2XOffset: "Memory offset of the second point's x-coordinate",
      p2YOffset: "Memory offset of the second point's y-coordinate",
      p2IsInfiniteOffset: "Memory offset of the second point's infinity flag",
      dstOffset: 'Memory offset for result point will be written (3 values)',
    },
    tagChecks: [
      '`T[p1XOffset] == FIELD`',
      '`T[p1YOffset] == FIELD`',
      '`T[p1IsInfiniteOffset] == UINT1`',
      '`T[p2XOffset] == FIELD`',
      '`T[p2YOffset] == FIELD`',
      '`T[p2IsInfiniteOffset] == UINT1`',
    ],
    tagUpdates: ['`T[dstOffset] = FIELD`', '`T[dstOffset+1] = FIELD`', '`T[dstOffset+2] = UINT1`'],
  },

  // Conversion Operations
  TORADIXBE: {
    summary: 'Convert to radix (big-endian)',
    expression: `M[dstOffset:dstOffset+M[numLimbsOffset]] = toRadixBE(
        /*value=*/M[srcOffset],
        /*radix=*/M[radixOffset],
        /*numLimbs=*/M[numLimbsOffset],
        /*outputBits=*/M[outputBitsOffset]
    )`,
    details:
      'Decomposes a field element into limbs in the specified radix (2-256). If outputBits is true (Uint1), outputs Uint1 array; otherwise outputs Uint8 array. Source must be FIELD, radix and numLimbs must be Uint32.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Operands have incorrect type tags' },
      { condition: 'INVALID_RADIX', description: 'Radix is not in range [2, 256]' },
      { condition: 'INVALID_NUM_LIMBS', description: 'Number of limbs is zero but value is non-zero' },
      { condition: 'INVALID_DECOMPOSITION', description: 'Value cannot be decomposed into specified radix/limbs' },
      { condition: 'INVALID_BIT_MODE', description: 'Bit mode is enabled but radix is not 2' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      srcOffset: 'Memory offset of the field element to decompose',
      dstOffset: 'Memory offset for limb array will be written',
      radixOffset: 'Memory offset of the radix (base) for decomposition',
      numLimbsOffset: 'Memory offset of the number of limbs to generate',
      outputBitsOffset: 'Memory offset of the output mode flag (1 for bits, 0 for bytes)',
    },
    tagChecks: [
      '`T[srcOffset] == FIELD`',
      '`T[radixOffset] == UINT32`',
      '`T[numLimbsOffset] == UINT32`',
      '`T[outputBitsOffset] == UINT1`',
    ],
    tagUpdates: ['`T[dstOffset:dstOffset+M[numLimbsOffset]] = (M[outputBitsOffset] ? UINT1 : UINT8)`'],
    gasScaling: {
      l2Gas: 'M[numLimbsOffset], M[radixOffset]*',
      note: '*Note: The L2 gas cost scales linearly with M[numLimbsOffset], but also includes a per-limb multiplier based on M[radixOffset]',
    },
  },

  // Misc Operations
  DEBUGLOG: {
    summary: 'Output debug log',
    expression: 'debugLog(level, message, M[fieldsOffset:fieldsOffset+M[fieldsSizeOffset]])',
    details:
      'Prints a debug log to console as a formatted a message, and pushes a structured debug object (`{contractAddress, level, message, fields[]}`) to an accumulated list for the transaction. This opcode does nearly nothing when executed by sequencers or provers (only performs PC increment and address resolution). It is meant for local debugging or for use by RPC nodes and wallets. Logs are only printed if logging level is "Debug" (6) or higher. Message size is an immediate (constant in the bytecode). Throws an irrecoverable error if truly doing debug logging and log level is invalid (greater than 7) or upon reaching the node\'s configured maxDebugLogMemoryReads.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Fields operands are not FIELD type' },
      { condition: 'INVALID_LOG_LEVEL', description: 'Log level is not a valid LogLevel enum value' },
      { condition: 'DEBUG_MEMORY_LIMIT_EXCEEDED', description: 'Exceeded maximum debug log memory reads' },
      { condition: 'MEMORY_ACCESS_OUT_OF_RANGE', description: 'Memory offset operand exceeds addressable memory' },
    ],
    operandDescriptions: {
      messageSize: 'Immediate value specifying message string length',
      messageOffset: 'Memory offset of the message string',
      fieldsOffset: 'Memory offset of the start of field values to log',
      fieldsSizeOffset: 'Memory offset of the number of fields to log',
    },
    tagChecks: ['`T[fieldsSizeOffset] == UINT32`', '`T[fieldsOffset:fieldsOffset+M[fieldsSizeOffset]] == FIELD`'],
    tagUpdates: [],
  },
};
