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
  /** Mathematical or logical expression representing the operation (e.g., 'M[dstOffset] = M[aOffset] + M[bOffset]') */
  expression: string;
  /** Brief one-line description of what the opcode does */
  description: string;
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
}

/**
 * Minimal metadata registry for all AVM opcodes.
 * Keys are the opcode type names (e.g., 'ADD', 'SUB', 'SET').
 * Only contains information that cannot be extracted programmatically.
 */
export const MinimalMetadataRegistry: Record<string, MinimalOpcodeMetadata> = {
  ADD: {
    expression: 'M[dstOffset] = M[aOffset] + M[bOffset]',
    description: 'Adds two field elements',
    details:
      'Performs field addition modulo p. Both operands must have the same type tag. The result inherits the tag from the operands.',
    errors: [{ condition: 'TAG_MISMATCH', description: 'Operands have different type tags' }],
    operandDescriptions: {
      aOffset: 'Memory offset of the first operand',
      bOffset: 'Memory offset of the second operand',
      dstOffset: 'Memory offset specifying where to store the result',
    },
  },

  SUB: {
    expression: 'M[dstOffset] = M[aOffset] - M[bOffset]',
    description: 'Subtracts two field elements',
    details:
      'Performs field subtraction modulo p. Both operands must have the same type tag. The result inherits the tag from the operands.',
    errors: [{ condition: 'TAG_MISMATCH', description: 'Operands have different type tags' }],
    operandDescriptions: {
      aOffset: 'Memory offset of the minuend',
      bOffset: 'Memory offset of the subtrahend',
      dstOffset: 'Memory offset specifying where to store the result',
    },
  },

  MUL: {
    expression: 'M[dstOffset] = M[aOffset] * M[bOffset]',
    description: 'Multiplies two field elements',
    details:
      'Performs field multiplication modulo p. Both operands must have the same type tag. The result inherits the tag from the operands.',
    errors: [{ condition: 'TAG_MISMATCH', description: 'Operands have different type tags' }],
    operandDescriptions: {
      aOffset: 'Memory offset of the first factor',
      bOffset: 'Memory offset of the second factor',
      dstOffset: 'Memory offset specifying where to store the result',
    },
  },

  DIV: {
    expression: 'M[dstOffset] = M[aOffset] / M[bOffset]',
    description: 'Divides two integer values',
    details:
      'Performs integer division. Both operands must have the same integral type tag (not FIELD). The result inherits the tag from the operands.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'INVALID_TAG_TYPE', description: 'Operands are not integral types' },
      { condition: 'DIVISION_BY_ZERO', description: 'Second operand (divisor) is zero' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of the dividend',
      bOffset: 'Memory offset of the divisor',
      dstOffset: 'Memory offset specifying where to store the quotient',
    },
  },

  FDIV: {
    expression: 'M[dstOffset] = M[aOffset] / M[bOffset]',
    description: 'Performs field division (multiplicative inverse)',
    details:
      'Performs field division by computing the multiplicative inverse modulo p. Both operands must have FIELD type tag.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'INVALID_TAG_TYPE', description: 'Operands do not have FIELD type tag' },
      { condition: 'DIVISION_BY_ZERO', description: 'Second operand (divisor) is zero' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of the dividend',
      bOffset: 'Memory offset of the divisor',
      dstOffset: 'Memory offset specifying where to store the result',
    },
  },

  SET: {
    expression: 'M[dstOffset] = value',
    description: 'Sets a memory location to an immediate value with specified tag',
    details:
      'Stores an immediate value at the specified memory offset with the given type tag. Multiple wire formats support different value sizes.',
    errors: [{ condition: 'INVALID_TAG', description: 'Specified tag is not a valid TypeTag' }],
    operandDescriptions: {
      tag: 'Type tag to assign to the value',
      value: 'Immediate value to store',
      dstOffset: 'Memory offset where the value will be stored',
    },
  },

  MOV: {
    expression: 'M[dstOffset] = M[srcOffset]',
    description: 'Copies a value from one memory location to another',
    details: 'Copies a value and its type tag from the source memory offset to the destination offset.',
    errors: [],
    operandDescriptions: {
      srcOffset: 'Memory offset to read from',
      dstOffset: 'Memory offset to write to',
    },
  },

  SHL: {
    expression: 'M[dstOffset] = M[aOffset] << M[bOffset]',
    description: 'Shifts an integer value left by specified bits',
    details:
      'Performs left bit shift. Both operands must have the same integral type tag. The result inherits the tag from the operands.',
    errors: [{ condition: 'TAG_MISMATCH', description: 'Operands have different type tags' }],
    operandDescriptions: {
      aOffset: 'Memory offset of the value to shift',
      bOffset: 'Memory offset of the shift amount',
      dstOffset: 'Memory offset specifying where to store the result',
    },
  },

  SHR: {
    expression: 'M[dstOffset] = M[aOffset] >> M[bOffset]',
    description: 'Shifts an integer value right by specified bits',
    details:
      'Performs right bit shift. Both operands must have the same integral type tag. The result inherits the tag from the operands.',
    errors: [{ condition: 'TAG_MISMATCH', description: 'Operands have different type tags' }],
    operandDescriptions: {
      aOffset: 'Memory offset of the value to shift',
      bOffset: 'Memory offset of the shift amount',
      dstOffset: 'Memory offset specifying where to store the result',
    },
  },

  // Bitwise Operations
  AND: {
    expression: 'M[dstOffset] = M[aOffset] & M[bOffset]',
    description: 'Bitwise AND of two integer values',
    details:
      'Performs bitwise AND operation. Both operands must have the same integral type tag. The result inherits the tag from the operands.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'INVALID_TAG_TYPE', description: 'Operands are not integral types' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of the first operand',
      bOffset: 'Memory offset of the second operand',
      dstOffset: 'Memory offset specifying where to store the result',
    },
  },

  OR: {
    expression: 'M[dstOffset] = M[aOffset] | M[bOffset]',
    description: 'Bitwise OR of two integer values',
    details:
      'Performs bitwise OR operation. Both operands must have the same integral type tag. The result inherits the tag from the operands.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'INVALID_TAG_TYPE', description: 'Operands are not integral types' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of the first operand',
      bOffset: 'Memory offset of the second operand',
      dstOffset: 'Memory offset specifying where to store the result',
    },
  },

  XOR: {
    expression: 'M[dstOffset] = M[aOffset] ^ M[bOffset]',
    description: 'Bitwise XOR of two integer values',
    details:
      'Performs bitwise XOR operation. Both operands must have the same integral type tag. The result inherits the tag from the operands.',
    errors: [
      { condition: 'TAG_MISMATCH', description: 'Operands have different type tags' },
      { condition: 'INVALID_TAG_TYPE', description: 'Operands are not integral types' },
    ],
    operandDescriptions: {
      aOffset: 'Memory offset of the first operand',
      bOffset: 'Memory offset of the second operand',
      dstOffset: 'Memory offset specifying where to store the result',
    },
  },

  NOT: {
    expression: 'M[dstOffset] = ~M[srcOffset]',
    description: 'Bitwise NOT of an integer value',
    details:
      "Performs bitwise NOT operation (one's complement). The operand must have an integral type tag. The result inherits the tag from the operand.",
    errors: [{ condition: 'INVALID_TAG_TYPE', description: 'Operand is not an integral type' }],
    operandDescriptions: {
      srcOffset: 'Memory offset of the value to negate',
      dstOffset: 'Memory offset specifying where to store the result',
    },
  },

  // Comparison Operations
  EQ: {
    expression: 'M[dstOffset] = (M[aOffset] == M[bOffset]) ? 1 : 0',
    description: 'Tests equality of two values',
    details:
      'Compares two values for equality. Both operands must have the same type tag. The result is a Uint1 (0 or 1).',
    errors: [{ condition: 'TAG_MISMATCH', description: 'Operands have different type tags' }],
    operandDescriptions: {
      aOffset: 'Memory offset of the first value to compare',
      bOffset: 'Memory offset of the second value to compare',
      dstOffset: 'Memory offset specifying where to store the result (0 or 1)',
    },
  },

  LT: {
    expression: 'M[dstOffset] = (M[aOffset] < M[bOffset]) ? 1 : 0',
    description: 'Tests if first value is less than second',
    details: 'Compares two values. Both operands must have the same type tag. The result is a Uint1 (0 or 1).',
    errors: [{ condition: 'TAG_MISMATCH', description: 'Operands have different type tags' }],
    operandDescriptions: {
      aOffset: 'Memory offset of the first value to compare',
      bOffset: 'Memory offset of the second value to compare',
      dstOffset: 'Memory offset specifying where to store the result (0 or 1)',
    },
  },

  LTE: {
    expression: 'M[dstOffset] = (M[aOffset] <= M[bOffset]) ? 1 : 0',
    description: 'Tests if first value is less than or equal to second',
    details: 'Compares two values. Both operands must have the same type tag. The result is a Uint1 (0 or 1).',
    errors: [{ condition: 'TAG_MISMATCH', description: 'Operands have different type tags' }],
    operandDescriptions: {
      aOffset: 'Memory offset of the first value to compare',
      bOffset: 'Memory offset of the second value to compare',
      dstOffset: 'Memory offset specifying where to store the result (0 or 1)',
    },
  },

  CAST: {
    expression: 'M[dstOffset] = M[srcOffset] as tag',
    description: 'Casts a value to a different type tag',
    details: 'Changes the type tag of a value. The value itself is preserved, only its type interpretation changes.',
    errors: [{ condition: 'INVALID_TAG', description: 'Destination tag is not a valid TypeTag' }],
    operandDescriptions: {
      dstTag: 'Type tag to cast the value to',
      srcOffset: 'Memory offset of the value to cast',
      dstOffset: 'Memory offset specifying where to store the casted value',
    },
  },

  // Control Flow
  JUMP: {
    expression: 'PC = jumpOffset',
    description: 'Unconditional jump to a bytecode offset',
    details: 'Sets the program counter to the specified offset. The offset is an immediate value (not from memory).',
    errors: [{ condition: 'INVALID_PROGRAM_COUNTER', description: 'Jump offset is outside valid bytecode range' }],
    operandDescriptions: {
      jumpOffset: 'Immediate bytecode offset to jump to',
    },
  },

  JUMPI: {
    expression: 'if M[condOffset] != 0 then PC = loc else PC = PC + instructionSize',
    description: 'Conditional jump based on a condition value',
    details:
      'Jumps to the specified location if the condition is non-zero (true). The condition must have type tag Uint1.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Condition operand is not Uint1' },
      { condition: 'INVALID_PROGRAM_COUNTER', description: 'Jump location is outside valid bytecode range' },
    ],
    operandDescriptions: {
      loc: 'Immediate bytecode offset to jump to if condition is true',
      condOffset: 'Memory offset of the condition value (Uint1)',
    },
  },

  INTERNALCALL: {
    expression: 'internalCallStack.push({callPc: PC, returnPc: PC + instructionSize}); PC = loc',
    description: 'Calls an internal function at specified bytecode offset',
    details: 'Pushes current PC and return address onto internal call stack, then jumps to the target location.',
    errors: [
      { condition: 'INVALID_PROGRAM_COUNTER', description: 'Call location is outside valid bytecode range' },
      { condition: 'CALL_STACK_OVERFLOW', description: 'Internal call stack is full' },
    ],
    operandDescriptions: {
      loc: 'Immediate bytecode offset of the function to call',
    },
  },

  INTERNALRETURN: {
    expression: 'PC = internalCallStack.pop().returnPc',
    description: 'Returns from an internal function call',
    details: 'Pops return address from internal call stack and sets PC to that address.',
    errors: [{ condition: 'CALL_STACK_UNDERFLOW', description: 'Internal call stack is empty' }],
    operandDescriptions: {},
  },

  // Environment Operations
  GETENVVAR: {
    expression: 'M[dstOffset] = environmentVariable[varEnum]',
    description: 'Reads an environment variable into memory',
    details:
      'Retrieves environment variables like address, sender, chainId, timestamp, gas left, etc. The variable is specified by an immediate enum value.',
    errors: [{ condition: 'INVALID_ENV_VAR', description: 'Variable enum is not a valid EnvironmentVariable' }],
    operandDescriptions: {
      varEnum: 'Immediate value specifying which environment variable to read',
    },
  },

  CALLDATACOPY: {
    expression: 'M[dstOffset:dstOffset+copySize] = calldata[cdOffset:cdOffset+copySize]',
    description: 'Copies calldata into memory',
    details: "Copies a slice of the current call's calldata into memory at the specified offset.",
    errors: [{ condition: 'INVALID_TAG', description: 'Size operand is not Uint32' }],
    operandDescriptions: {
      cdOffset: 'Memory offset of the calldata start index to copy from',
      copySize: 'Memory offset of the number of elements to copy',
      dstOffset: 'Memory offset specifying where to start writing calldata',
    },
  },

  RETURNDATASIZE: {
    expression: 'M[dstOffset] = nestedReturndata.length',
    description: 'Gets the size of return data from last nested call',
    details: 'Returns the size of the return data from the most recent nested contract call. Result is Uint32.',
    errors: [],
    operandDescriptions: {
      dstOffset: 'Memory offset where the size will be written',
    },
  },

  RETURNDATACOPY: {
    expression: 'M[dstOffset:dstOffset+copySize] = nestedReturndata[rdOffset:rdOffset+copySize]',
    description: 'Copies return data from last nested call into memory',
    details: 'Copies a slice of the return data from the most recent nested contract call into memory.',
    errors: [{ condition: 'INVALID_TAG', description: 'Size operand is not Uint32' }],
    operandDescriptions: {
      rdOffset: 'Memory offset of the return data start index to copy from',
      copySize: 'Memory offset of the number of elements to copy',
      dstOffset: 'Memory offset specifying where to start writing return data',
    },
  },

  SUCCESSCOPY: {
    expression: 'M[dstOffset] = nestedCallSuccess ? 1 : 0',
    description: 'Gets the success status from last nested call',
    details: 'Returns 1 if the most recent nested call succeeded, 0 if it reverted. Result is Uint1.',
    errors: [],
    operandDescriptions: {
      dstOffset: 'Memory offset where the success status (0 or 1) will be written',
    },
  },

  // Storage Operations
  SLOAD: {
    expression: 'M[dstOffset] = storage[contractAddress][M[slotOffset]]',
    description: 'Loads a value from contract storage',
    details:
      'Reads from public storage at the specified slot. Both slot and result have type tag FIELD. Gas cost varies based on whether the slot is warm or cold.',
    errors: [{ condition: 'INVALID_TAG', description: 'Slot operand is not FIELD' }],
    operandDescriptions: {
      slotOffset: 'Memory offset of the storage slot to read from',
      dstOffset: 'Memory offset where the loaded value will be written',
    },
  },

  SSTORE: {
    expression: 'storage[contractAddress][M[slotOffset]] = M[srcOffset]',
    description: 'Stores a value to contract storage',
    details:
      'Writes to public storage at the specified slot. Both slot and value must have type tag FIELD. Gas cost varies based on whether the slot is warm or cold. Reverts in static calls.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Slot or value operand is not FIELD' },
      { condition: 'STATIC_CALL_ALTERATION', description: 'Attempted storage write in static call context' },
    ],
    operandDescriptions: {
      srcOffset: 'Memory offset of the value to store',
      slotOffset: 'Memory offset of the storage slot to write to',
    },
  },

  // World State Operations
  NOTEHASHEXISTS: {
    expression: 'M[existsOffset] = noteHashTree.exists(M[noteHashOffset], M[leafIndexOffset]) ? 1 : 0',
    description: 'Checks if a note hash exists in the tree',
    details:
      'Queries whether the specified note hash exists at the given leaf index. Note hash must be FIELD, leaf index must be Uint64. Result is Uint1.',
    errors: [{ condition: 'INVALID_TAG', description: 'Note hash is not FIELD or leaf index is not Uint64' }],
    operandDescriptions: {
      noteHashOffset: 'Memory offset of the note hash to check',
      leafIndexOffset: 'Memory offset of the leaf index in the note hash tree',
      existsOffset: 'Memory offset where the result (0 or 1) will be written',
    },
  },

  EMITNOTEHASH: {
    expression: 'noteHashes.append(M[noteHashOffset])',
    description: 'Emits a note hash to the output',
    details:
      "Adds a note hash to the current call's accumulated note hashes. Note hash must have type tag FIELD. Reverts in static calls.",
    errors: [
      { condition: 'INVALID_TAG', description: 'Note hash operand is not FIELD' },
      { condition: 'STATIC_CALL_ALTERATION', description: 'Attempted note hash emission in static call context' },
    ],
    operandDescriptions: {
      noteHashOffset: 'Memory offset of the note hash to emit',
    },
  },

  NULLIFIEREXISTS: {
    expression: 'M[existsOffset] = nullifierTree.exists(M[addressOffset], M[nullifierOffset]) ? 1 : 0',
    description: 'Checks if a nullifier exists for a given address',
    details:
      'Queries whether the specified nullifier exists for the given contract address. Both address and nullifier must be FIELD. Result is Uint1.',
    errors: [{ condition: 'INVALID_TAG', description: 'Address or nullifier is not FIELD' }],
    operandDescriptions: {
      nullifierOffset: 'Memory offset of the nullifier to check',
      addressOffset: 'Memory offset of the contract address',
      existsOffset: 'Memory offset where the result (0 or 1) will be written',
    },
  },

  EMITNULLIFIER: {
    expression: 'nullifiers.append(M[nullifierOffset])',
    description: 'Emits a nullifier to the output',
    details:
      "Adds a nullifier to the current call's accumulated nullifiers. Nullifier must have type tag FIELD. Reverts in static calls or if nullifier already exists.",
    errors: [
      { condition: 'INVALID_TAG', description: 'Nullifier operand is not FIELD' },
      { condition: 'STATIC_CALL_ALTERATION', description: 'Attempted nullifier emission in static call context' },
      { condition: 'NULLIFIER_COLLISION', description: 'Nullifier already exists' },
    ],
    operandDescriptions: {
      nullifierOffset: 'Memory offset of the nullifier to emit',
    },
  },

  L1TOL2MSGEXISTS: {
    expression: 'M[existsOffset] = l1ToL2Messages.exists(M[msgHashOffset], M[msgLeafIndexOffset]) ? 1 : 0',
    description: 'Checks if an L1-to-L2 message exists',
    details:
      'Queries whether the specified L1-to-L2 message hash exists at the given leaf index. Message hash must be FIELD, leaf index must be Uint64. Result is Uint1.',
    errors: [{ condition: 'INVALID_TAG', description: 'Message hash is not FIELD or leaf index is not Uint64' }],
    operandDescriptions: {
      msgHashOffset: 'Memory offset of the L1-to-L2 message hash',
      msgLeafIndexOffset: 'Memory offset of the leaf index in the message tree',
      existsOffset: 'Memory offset where the result (0 or 1) will be written',
    },
  },

  GETCONTRACTINSTANCE: {
    expression: 'M[dstOffset] = contractInstance.exists ? 1 : 0; M[dstOffset+1] = contractInstance[memberEnum]',
    description: 'Retrieves contract instance information',
    details:
      'Looks up contract instance by address and retrieves the specified member (deployer, classId, or initHash). Returns existence flag (Uint1) and member value (FIELD).',
    errors: [
      { condition: 'INVALID_TAG', description: 'Address operand is not FIELD' },
      { condition: 'INVALID_MEMBER_ENUM', description: 'Member enum is not a valid ContractInstanceMember' },
    ],
    operandDescriptions: {
      memberEnum: 'Immediate value specifying which contract instance member to retrieve',
    },
  },

  EMITUNENCRYPTEDLOG: {
    expression: 'unencryptedLogs.append(M[logOffset:logOffset+M[logSizeOffset]])',
    description: 'Emits an unencrypted log',
    details:
      "Appends an unencrypted (public) log to the current call's accumulated logs. Log size must be Uint32, log data must be FIELD elements. Reverts in static calls.",
    errors: [
      { condition: 'INVALID_TAG', description: 'Log size is not Uint32 or log data is not FIELD' },
      { condition: 'STATIC_CALL_ALTERATION', description: 'Attempted log emission in static call context' },
    ],
    operandDescriptions: {
      logOffset: 'Memory offset of the start of the log data',
      logSizeOffset: 'Memory offset of the log size (number of fields)',
    },
  },

  SENDL2TOL1MSG: {
    expression: 'l2ToL1Messages.append({recipient: M[recipientOffset], content: M[contentOffset]})',
    description: 'Sends a message from L2 to L1',
    details:
      'Queues a message to be sent to L1. Both recipient and content must have type tag FIELD. Reverts in static calls.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Recipient or content is not FIELD' },
      { condition: 'STATIC_CALL_ALTERATION', description: 'Attempted L2-to-L1 message send in static call context' },
    ],
    operandDescriptions: {
      recipientOffset: 'Memory offset of the L1 recipient address',
      contentOffset: 'Memory offset of the message content',
    },
  },

  // External Call Operations
  CALL: {
    expression:
      'nestedCallResult = executeContract(M[addrOffset], M[argsOffset:argsOffset+M[argsSizeOffset]], {l2Gas: M[l2GasOffset], daGas: M[daGasOffset]})',
    description: 'Performs an external contract call',
    details:
      'Calls another contract with the specified calldata and gas allocation. Can modify state. The call consumes the allocated gas and refunds unused gas. Updates nestedCallSuccess and nestedReturndata.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Gas, address, or size operands have incorrect tags' },
      { condition: 'OUT_OF_GAS', description: 'Insufficient gas for the nested call' },
    ],
    operandDescriptions: {
      l2GasOffset: 'Memory offset of the L2 gas to allocate to the nested call',
      daGasOffset: 'Memory offset of the DA gas to allocate to the nested call',
      addrOffset: 'Memory offset of the target contract address',
      argsOffset: 'Memory offset of the start of the calldata',
      argsSizeOffset: 'Memory offset of the calldata size',
      successOffset: 'Memory offset where success flag (0 or 1) will be written',
    },
  },

  STATICCALL: {
    expression:
      'nestedCallResult = executeContractStatic(M[addrOffset], M[argsOffset:argsOffset+M[argsSizeOffset]], {l2Gas: M[l2GasOffset], daGas: M[daGasOffset]})',
    description: 'Performs a static external contract call',
    details:
      'Calls another contract in static mode (read-only). Any state modifications in the nested call will cause it to revert. Updates nestedCallSuccess and nestedReturndata.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Gas, address, or size operands have incorrect tags' },
      { condition: 'OUT_OF_GAS', description: 'Insufficient gas for the nested call' },
    ],
    operandDescriptions: {
      l2GasOffset: 'Memory offset of the L2 gas to allocate to the nested call',
      daGasOffset: 'Memory offset of the DA gas to allocate to the nested call',
      addrOffset: 'Memory offset of the target contract address',
      argsOffset: 'Memory offset of the start of the calldata',
      argsSizeOffset: 'Memory offset of the calldata size',
      successOffset: 'Memory offset where success flag (0 or 1) will be written',
    },
  },

  RETURN: {
    expression: 'return M[returnOffset:returnOffset+M[returnSizeOffset]]; halt',
    description: 'Returns from current call with data',
    details: 'Halts execution and returns data to the caller. Return size must be Uint32. Sets success flag.',
    errors: [{ condition: 'INVALID_TAG', description: 'Return size operand is not Uint32' }],
    operandDescriptions: {
      returnOffset: 'Memory offset of the start of the return data',
      returnSizeOffset: 'Memory offset of the return data size',
    },
  },

  REVERT: {
    expression: 'revert M[returnOffset:returnOffset+M[retSizeOffset]]; halt',
    description: 'Reverts current call with error data',
    details:
      'Halts execution with revert status and returns error data to the caller. Revert size must be Uint32. Undoes state changes.',
    errors: [{ condition: 'INVALID_TAG', description: 'Revert size operand is not Uint32' }],
    operandDescriptions: {
      returnOffset: 'Memory offset of the start of the revert data',
      retSizeOffset: 'Memory offset of the revert data size',
    },
  },

  // Gadget Operations
  POSEIDON2: {
    expression: 'M[outputStateOffset:outputStateOffset+4] = poseidon2(M[inputStateOffset:inputStateOffset+4])',
    description: 'Applies Poseidon2 permutation to a 4-element state',
    details:
      'Computes the Poseidon2 permutation on a state of 4 field elements. Input and output states must have type tag FIELD.',
    errors: [{ condition: 'INVALID_TAG', description: 'Input state elements are not FIELD' }],
    operandDescriptions: {
      inputStateOffset: 'Memory offset of the input state (4 field elements)',
      outputStateOffset: 'Memory offset where the output state will be written',
    },
  },

  SHA256COMPRESSION: {
    expression:
      'M[outputOffset:outputOffset+8] = sha256compress(M[stateOffset:stateOffset+8], M[inputsOffset:inputsOffset+16])',
    description: 'Applies SHA-256 compression function',
    details:
      'Computes the SHA-256 compression function on an 8-word state and 16-word input block. State and inputs must be Uint32. Outputs 8 Uint32 words.',
    errors: [{ condition: 'INVALID_TAG', description: 'State or inputs are not Uint32' }],
    operandDescriptions: {
      stateOffset: 'Memory offset of the 8-word SHA-256 state',
      inputsOffset: 'Memory offset of the 16-word input block',
      outputOffset: 'Memory offset where the 8-word output state will be written',
    },
  },

  KECCAKF1600: {
    expression: 'M[dstOffset:dstOffset+25] = keccakf1600(M[inputOffset:inputOffset+25])',
    description: 'Applies Keccak-f[1600] permutation',
    details:
      'Computes the Keccak-f[1600] permutation on a state of 25 Uint64 elements. Input and output must have type tag Uint64.',
    errors: [{ condition: 'INVALID_TAG', description: 'Input state elements are not Uint64' }],
    operandDescriptions: {
      inputOffset: 'Memory offset of the input state (25 Uint64 elements)',
      dstOffset: 'Memory offset where the output state will be written',
    },
  },

  ECADD: {
    expression: 'M[dstOffset:dstOffset+3] = grumpkinAdd(point1, point2)',
    description: 'Adds two Grumpkin elliptic curve points',
    details:
      'Performs elliptic curve point addition on the Grumpkin curve. Each point is represented as (x: FIELD, y: FIELD, isInfinite: Uint1). Returns result point in same format.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Point coordinates are not FIELD or infinity flags are not Uint1' },
      { condition: 'POINT_NOT_ON_CURVE', description: 'One or both points are not on the Grumpkin curve' },
    ],
    operandDescriptions: {
      p1XOffset: "Memory offset of the first point's x-coordinate",
      p1YOffset: "Memory offset of the first point's y-coordinate",
      p1IsInfiniteOffset: "Memory offset of the first point's infinity flag",
      p2XOffset: "Memory offset of the second point's x-coordinate",
      p2YOffset: "Memory offset of the second point's y-coordinate",
      p2IsInfiniteOffset: "Memory offset of the second point's infinity flag",
      dstOffset: 'Memory offset where the result point will be written (3 values)',
    },
  },

  // Conversion Operations
  TORADIXBE: {
    expression:
      'M[dstOffset:dstOffset+M[numLimbsOffset]] = toRadixBE(M[srcOffset], M[radixOffset], M[numLimbsOffset], M[outputBitsOffset])',
    description: 'Converts a field element to radix representation (big-endian)',
    details:
      'Decomposes a field element into limbs in the specified radix (2-256). If outputBits is true (Uint1), outputs Uint1 array; otherwise outputs Uint8 array. Source must be FIELD, radix and numLimbs must be Uint32.',
    errors: [
      { condition: 'INVALID_TAG', description: 'Operands have incorrect type tags' },
      { condition: 'INVALID_RADIX', description: 'Radix is not in range [2, 256]' },
      { condition: 'INVALID_NUM_LIMBS', description: 'Number of limbs is zero but value is non-zero' },
      {
        condition: 'INVALID_DECOMPOSITION',
        description: 'Value cannot be decomposed in the specified number of limbs',
      },
      { condition: 'INVALID_BIT_MODE', description: 'Bit mode is enabled but radix is not 2' },
    ],
    operandDescriptions: {
      srcOffset: 'Memory offset of the field element to decompose',
      dstOffset: 'Memory offset where the limb array will be written',
      radixOffset: 'Memory offset of the radix (base) for decomposition',
      numLimbsOffset: 'Memory offset of the number of limbs to generate',
      outputBitsOffset: 'Memory offset of the output mode flag (1 for bits, 0 for bytes)',
    },
  },

  // Misc Operations
  DEBUGLOG: {
    expression: 'debugLog(level, message, M[fieldsOffset:fieldsOffset+M[fieldsSizeOffset]])',
    description: 'Logs debug information during execution',
    details:
      'Emits a debug log with a message string and field values. Only executed if debug logging is enabled. Level must be Uint8, fields must be FIELD, message size and fields size are immediate. Counts against max debug memory reads limit.',
    errors: [
      {
        condition: 'INVALID_TAG',
        description: 'Level is not Uint8, fields size is not Uint32, or message/fields have incorrect tags',
      },
      { condition: 'INVALID_LOG_LEVEL', description: 'Log level is not a valid LogLevel enum value' },
      { condition: 'DEBUG_MEMORY_LIMIT_EXCEEDED', description: 'Exceeded maximum debug log memory reads' },
    ],
    operandDescriptions: {
      messageSize: 'Immediate value specifying message string length',
      messageOffset: 'Memory offset of the message string',
      fieldsOffset: 'Memory offset of the start of field values to log',
      fieldsSizeOffset: 'Memory offset of the number of fields to log',
    },
  },
};
