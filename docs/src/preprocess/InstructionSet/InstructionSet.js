const { instructionSize } = require("./InstructionSize");

const TOPICS_IN_TABLE = ["Name", "Summary", "Expression"];
const TOPICS_IN_SECTIONS = [
  "Name",
  "Summary",
  "Category",
  "Flags",
  "Args",
  "Expression",
  "Details",
  "World State access tracing",
  "Additional AVM circuit checks",
  "Triggers downstream circuit operations",
  "Tag checks",
  "Tag updates",
  "Bit-size",
];

const IN_TAG_DESCRIPTION =
  "The [tag/size](./memory-model#tags-and-tagged-memory) to check inputs against and tag the destination with.";
const IN_TAG_DESCRIPTION_NO_FIELD =
  IN_TAG_DESCRIPTION + " `field` type is NOT supported for this instruction.";
const DST_TAG_DESCRIPTION =
  "The [tag/size](./memory-model#tags-and-tagged-memory) to tag the destination with but not to check inputs against.";
const INDIRECT_FLAG_DESCRIPTION =
  "Toggles whether each memory-offset argument is an indirect offset. Rightmost bit corresponds to 0th offset arg, etc. Indirect offsets result in memory accesses like `M[M[offset]]` instead of the more standard `M[offset]`.";

const CALL_INSTRUCTION_ARGS = [
  {
    name: "gasOffset",
    description:
      "offset to two words containing `{l2GasLeft, daGasLeft}`: amount of gas to provide to the callee",
  },
  { name: "addrOffset", description: "address of the contract to call" },
  {
    name: "argsOffset",
    description: "memory offset to args (will become the callee's calldata)",
  },
  {
    name: "argsSizeOffset",
    description:
      "memory offset for the number of words to pass via callee's calldata",
  },
  {
    name: "retOffset",
    description:
      "destination memory offset specifying where to store the data returned from the callee",
  },
  {
    name: "retSize",
    description: "number of words to copy from data returned by callee",
    mode: "immediate",
    type: "u32",
  },
  {
    name: "successOffset",
    description:
      "destination memory offset specifying where to store the call's success (0: failure, 1: success)",
    type: "u8",
  },
];
const CALL_INSTRUCTION_DETAILS = `
    ["Nested contract calls"](./nested-calls) provides a full explanation of this
    instruction along with the shorthand used in the expression above.
    The explanation includes details on charging gas for nested calls,
    nested context derivation, world state tracing, and updating the parent context
    after the nested call halts.`;

const INSTRUCTION_SET_RAW = [
  {
    id: "add",
    Name: "`ADD`",
    Category: "Compute - Arithmetic",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "inTag", description: IN_TAG_DESCRIPTION },
    ],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's left input",
      },
      {
        name: "bOffset",
        description: "memory offset of the operation's right input",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] + M[bOffset] mod 2^k`",
    Summary: "Addition (a + b)",
    Details: "Wraps on overflow",
    "Tag checks": "`T[aOffset] == T[bOffset] == inTag`",
    "Tag updates": "`T[dstOffset] = inTag`",
  },
  {
    id: "sub",
    Name: "`SUB`",
    Category: "Compute - Arithmetic",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "inTag", description: IN_TAG_DESCRIPTION },
    ],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's left input",
      },
      {
        name: "bOffset",
        description: "memory offset of the operation's right input",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] - M[bOffset] mod 2^k`",
    Summary: "Subtraction (a - b)",
    Details: "Wraps on undeflow",
    "Tag checks": "`T[aOffset] == T[bOffset] == inTag`",
    "Tag updates": "`T[dstOffset] = inTag`",
  },
  {
    id: "mul",
    Name: "`MUL`",
    Category: "Compute - Arithmetic",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "inTag", description: IN_TAG_DESCRIPTION },
    ],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's left input",
      },
      {
        name: "bOffset",
        description: "memory offset of the operation's right input",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] * M[bOffset] mod 2^k`",
    Summary: "Multiplication (a * b)",
    Details: "Wraps on overflow",
    "Tag checks": "`T[aOffset] == T[bOffset] == inTag`",
    "Tag updates": "`T[dstOffset] = inTag`",
  },
  {
    id: "div",
    Name: "`DIV`",
    Category: "Compute - Arithmetic",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "inTag", description: IN_TAG_DESCRIPTION },
    ],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's left input",
      },
      {
        name: "bOffset",
        description: "memory offset of the operation's right input",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] / M[bOffset]`",
    Summary: "Unsigned integer division (a / b)",
    Details: "If the input is a field, it will be interpreted as an integer",
    "Tag checks": "`T[aOffset] == T[bOffset] == inTag`",
    "Tag updates": "`T[dstOffset] = inTag`",
  },
  {
    id: "fdiv",
    Name: "`FDIV`",
    Category: "Compute - Arithmetic",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's left input",
      },
      {
        name: "bOffset",
        description: "memory offset of the operation's right input",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] / M[bOffset]`",
    Summary: "Field division (a / b)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset] == field`",
    "Tag updates": "`T[dstOffset] = field`",
  },
  {
    id: "eq",
    Name: "`EQ`",
    Category: "Compute - Comparators",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "inTag", description: IN_TAG_DESCRIPTION },
    ],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's left input",
      },
      {
        name: "bOffset",
        description: "memory offset of the operation's right input",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
        type: "u8",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] == M[bOffset] ? 1 : 0`",
    Summary: "Equality check (a == b)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset] == inTag`",
    "Tag updates": "`T[dstOffset] = u8`",
  },
  {
    id: "lt",
    Name: "`LT`",
    Category: "Compute - Comparators",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "inTag", description: IN_TAG_DESCRIPTION },
    ],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's left input",
      },
      {
        name: "bOffset",
        description: "memory offset of the operation's right input",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
        type: "u8",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] < M[bOffset] ? 1 : 0`",
    Summary: "Less-than check (a < b)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset] == inTag`",
    "Tag updates": "`T[dstOffset] = u8`",
  },
  {
    id: "lte",
    Name: "`LTE`",
    Category: "Compute - Comparators",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "inTag", description: IN_TAG_DESCRIPTION },
    ],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's left input",
      },
      {
        name: "bOffset",
        description: "memory offset of the operation's right input",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
        type: "u8",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] <= M[bOffset] ? 1 : 0`",
    Summary: "Less-than-or-equals check (a <= b)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset] == inTag`",
    "Tag updates": "`T[dstOffset] = u8`",
  },
  {
    id: "and",
    Name: "`AND`",
    Category: "Compute - Bitwise",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "inTag", description: IN_TAG_DESCRIPTION_NO_FIELD },
    ],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's left input",
      },
      {
        name: "bOffset",
        description: "memory offset of the operation's right input",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] AND M[bOffset]`",
    Summary: "Bitwise AND (a & b)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset] == inTag`",
    "Tag updates": "`T[dstOffset] = inTag`",
  },
  {
    id: "or",
    Name: "`OR`",
    Category: "Compute - Bitwise",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "inTag", description: IN_TAG_DESCRIPTION_NO_FIELD },
    ],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's left input",
      },
      {
        name: "bOffset",
        description: "memory offset of the operation's right input",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] OR M[bOffset]`",
    Summary: "Bitwise OR (a | b)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset] == inTag`",
    "Tag updates": "`T[dstOffset] = inTag`",
  },
  {
    id: "xor",
    Name: "`XOR`",
    Category: "Compute - Bitwise",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "inTag", description: IN_TAG_DESCRIPTION_NO_FIELD },
    ],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's left input",
      },
      {
        name: "bOffset",
        description: "memory offset of the operation's right input",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] XOR M[bOffset]`",
    Summary: "Bitwise XOR (a ^ b)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset] == inTag`",
    "Tag updates": "`T[dstOffset] = inTag`",
  },
  {
    id: "not",
    Name: "`NOT`",
    Category: "Compute - Bitwise",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "inTag", description: IN_TAG_DESCRIPTION_NO_FIELD },
    ],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's input",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = NOT M[aOffset]`",
    Summary: "Bitwise NOT (inversion)",
    Details: "",
    "Tag checks": "`T[aOffset] == inTag`",
    "Tag updates": "`T[dstOffset] = inTag`",
  },
  {
    id: "shl",
    Name: "`SHL`",
    Category: "Compute - Bitwise",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "inTag", description: IN_TAG_DESCRIPTION_NO_FIELD },
    ],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's left input",
      },
      {
        name: "bOffset",
        description: "memory offset of the operation's right input",
        type: "u8",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] << M[bOffset]`",
    Summary: "Bitwise leftward shift (a << b)",
    Details: "",
    "Tag checks": "`T[aOffset] == inTag`, `T[bOffset] == u8`",
    "Tag updates": "`T[dstOffset] = inTag`",
  },
  {
    id: "shr",
    Name: "`SHR`",
    Category: "Compute - Bitwise",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "inTag", description: IN_TAG_DESCRIPTION_NO_FIELD },
    ],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of the operation's left input",
      },
      {
        name: "bOffset",
        description: "memory offset of the operation's right input",
        type: "u8",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] >> M[bOffset]`",
    Summary: "Bitwise rightward shift (a >> b)",
    Details: "",
    "Tag checks": "`T[aOffset] == inTag`, `T[bOffset] == u8`",
    "Tag updates": "`T[dstOffset] = inTag`",
  },
  {
    id: "cast",
    Name: "`CAST`",
    Category: "Type Conversions",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      { name: "dstTag", description: DST_TAG_DESCRIPTION },
    ],
    Args: [
      { name: "aOffset", description: "memory offset of word to cast" },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = cast<dstTag>(M[aOffset])`",
    Summary: "Type cast",
    Details:
      "Cast a word in memory based on the `dstTag` specified in the bytecode. Truncates (`M[dstOffset] = M[aOffset] mod 2^dstsize`) when casting to a smaller type, left-zero-pads when casting to a larger type. See [here](./memory-model#cast-and-tag-conversions) for more details.",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = dstTag`",
  },
  {
    id: "address",
    Name: "`ADDRESS`",
    Category: "Execution Environment",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = context.environment.address`",
    Summary: "Get the address of the currently executing l2 contract",
    Details: "",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = field`",
  },
  {
    id: "sender",
    Name: "`SENDER`",
    Category: "Execution Environment",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = context.environment.sender`",
    Summary: "Get the address of the sender (caller of the current context)",
    Details: "",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = field`",
  },
  {
    id: "transactionfee",
    Name: "`TRANSACTIONFEE`",
    Category: "Execution Environment",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = context.environment.transactionFee`",
    Summary:
      "Get the computed transaction fee during teardown phase, zero otherwise",
    Details: "",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = field`",
  },
  {
    id: "chainid",
    Name: "`CHAINID`",
    Category: "Execution Environment - Globals",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = context.environment.globals.chainId`",
    Summary: "Get this rollup's L1 chain ID",
    Details: "",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = field`",
  },
  {
    id: "version",
    Name: "`VERSION`",
    Category: "Execution Environment - Globals",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = context.environment.globals.version`",
    Summary: "Get this rollup's L2 version ID",
    Details: "",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = field`",
  },
  {
    id: "blocknumber",
    Name: "`BLOCKNUMBER`",
    Category: "Execution Environment - Globals",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = context.environment.globals.blocknumber`",
    Summary: "Get this L2 block's number",
    Details: "",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = field`",
  },
  {
    id: "timestamp",
    Name: "`TIMESTAMP`",
    Category: "Execution Environment - Globals",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = context.environment.globals.timestamp`",
    Summary: "Get this L2 block's timestamp",
    Details: "",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = u64`",
  },
  {
    id: "feeperl2gas",
    Name: "`FEEPERL2GAS`",
    Category: "Execution Environment - Globals - Gas",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = context.environment.globals.feePerL2Gas`",
    Summary:
      'Get the fee to be paid per "L2 gas" - constant for entire transaction',
    Details: "",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = field`",
  },
  {
    id: "feeperdagas",
    Name: "`FEEPERDAGAS`",
    Category: "Execution Environment - Globals - Gas",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = context.environment.globals.feePerDaGas`",
    Summary:
      'Get the fee to be paid per "DA gas" - constant for entire transaction',
    Details: "",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = field`",
  },
  {
    id: "calldatacopy",
    Name: "`CALLDATACOPY`",
    Category: "Execution Environment - Calldata",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      { name: "cdOffset", description: "offset into calldata to copy from" },
      {
        name: "copySize",
        description: "number of words to copy",
        mode: "immediate",
        type: "u32",
      },
      {
        name: "dstOffset",
        description: "memory offset specifying where to copy the first word to",
      },
    ],
    Expression:
      "`M[dstOffset:dstOffset+copySize] = context.environment.calldata[cdOffset:cdOffset+copySize]`",
    Summary: "Copy calldata into memory",
    Details:
      "Calldata is read-only and cannot be directly operated on by other instructions. This instruction moves words from calldata into memory so they can be operated on normally.",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset:dstOffset+copySize] = field`",
  },
  {
    id: "l2gasleft",
    Name: "`L2GASLEFT`",
    Category: "Machine State - Gas",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = context.MachineState.l2GasLeft`",
    Summary: 'Remaining "L2 gas" for this call (after this instruction)',
    Details: "",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = u32`",
  },
  {
    id: "dagasleft",
    Name: "`DAGASLEFT`",
    Category: "Machine State - Gas",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = context.machineState.daGasLeft`",
    Summary: 'Remaining "DA gas" for this call (after this instruction)',
    Details: "",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = u32`",
  },
  {
    id: "jump",
    Name: "`JUMP`",
    Category: "Machine State - Control Flow",
    Flags: [],
    Args: [
      {
        name: "loc",
        description: "target location to jump to",
        mode: "immediate",
        type: "u32",
      },
    ],
    Expression: "`context.machineState.pc = loc`",
    Summary: "Jump to a location in the bytecode",
    Details:
      "Target location is an immediate value (a constant in the bytecode).",
    "Tag checks": "",
    "Tag updates": "",
  },
  {
    id: "jumpi",
    Name: "`JUMPI`",
    Category: "Machine State - Control Flow",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "loc",
        description: "target location conditionally jump to",
        mode: "immediate",
        type: "u32",
      },
      {
        name: "condOffset",
        description: "memory offset of the operations 'conditional' input",
      },
    ],
    Expression:
      "`context.machineState.pc = M[condOffset] > 0 ? loc : context.machineState.pc`",
    Summary: "Conditionally jump to a location in the bytecode",
    Details:
      "Target location is an immediate value (a constant in the bytecode). `T[condOffset]` is not checked because the greater-than-zero suboperation is the same regardless of type.",
    "Tag checks": "",
    "Tag updates": "",
  },
  {
    id: "internalcall",
    Name: "`INTERNALCALL`",
    Category: "Machine State - Control Flow",
    Flags: [],
    Args: [
      {
        name: "loc",
        description: "target location to jump/call to",
        mode: "immediate",
        type: "u32",
      },
    ],
    Expression: `
context.machineState.internalCallStack.push(context.machineState.pc)
context.machineState.pc = loc
`,
    Summary:
      "Make an internal call. Push the current PC to the internal call stack and jump to the target location.",
    Details:
      "Target location is an immediate value (a constant in the bytecode).",
    "Tag checks": "",
    "Tag updates": "",
  },
  {
    id: "internalreturn",
    Name: "`INTERNALRETURN`",
    Category: "Machine State - Control Flow",
    Flags: [],
    Args: [],
    Expression:
      "`context.machineState.pc = context.machineState.internalCallStack.pop()`",
    Summary:
      "Return from an internal call. Pop from the internal call stack and jump to the popped location.",
    Details: "",
    "Tag checks": "",
    "Tag updates": "",
  },
  {
    id: "set",
    Name: "`SET`",
    Category: "Machine State - Memory",
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
      {
        name: "inTag",
        description:
          "The [type/size](./memory-model#tags-and-tagged-memory) to check inputs against and tag the destination with. `field` type is NOT supported for SET.",
      },
    ],
    Args: [
      {
        name: "const",
        description:
          "an N-bit constant value from the bytecode to store in memory (any type except `field`)",
        mode: "immediate",
      },
      {
        name: "dstOffset",
        description: "memory offset specifying where to store the constant",
      },
    ],
    Expression: "`M[dstOffset] = const`",
    Summary: "Set a memory word from a constant in the bytecode",
    Details:
      "Set memory word at `dstOffset` to `const`'s immediate value. `const`'s bit-size (N) can be 8, 16, 32, 64, or 128 based on `inTag`. It _cannot be 254 (`field` type)_!",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = inTag`",
  },
  {
    id: "mov",
    Name: "`MOV`",
    Category: "Machine State - Memory",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      { name: "srcOffset", description: "memory offset of word to move" },
      {
        name: "dstOffset",
        description: "memory offset specifying where to store that word",
      },
    ],
    Expression: "`M[dstOffset] = M[srcOffset]`",
    Summary: "Move a word from source memory location to destination",
    Details: "",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = T[srcOffset]`",
  },
  {
    id: "cmov",
    Name: "`CMOV`",
    Category: "Machine State - Memory",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "aOffset",
        description: "memory offset of word 'a' to conditionally move",
      },
      {
        name: "bOffset",
        description: "memory offset of word 'b' to conditionally move",
      },
      {
        name: "condOffset",
        description: "memory offset of the operations 'conditional' input",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: "`M[dstOffset] = M[condOffset] > 0 ? M[aOffset] : M[bOffset]`",
    Summary:
      "Move a word (conditionally chosen) from one memory location to another (`d = cond > 0 ? a : b`)",
    Details:
      "One of two source memory locations is chosen based on the condition. `T[condOffset]` is not checked because the greater-than-zero suboperation is the same regardless of type.",
    "Tag checks": "",
    "Tag updates":
      "`T[dstOffset] = M[condOffset] > 0 ? T[aOffset] : T[bOffset]`",
  },
  {
    id: "sload",
    Name: "`SLOAD`",
    Category: "World State - Public Storage",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "slotOffset",
        description: "memory offset of the storage slot to load from",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
    ],
    Expression: `
M[dstOffset] = S[M[slotOffset]]
`,
    Summary:
      "Load a word from this contract's persistent public storage. Zero is loaded for unwritten slots.",
    Details: `
// Expression is shorthand for
leafIndex = hash(context.environment.address, M[slotOffset])
exists = context.worldState.publicStorage.has(leafIndex) // exists == previously-written
if exists:
    value = context.worldState.publicStorage.get(leafIndex: leafIndex)
else:
    value = 0
M[dstOffset] = value
`,
    "World State access tracing": `
context.worldStateAccessTrace.publicStorageReads.append(
    TracedStorageRead {
        callPointer: context.environment.callPointer,
        slot: M[slotOffset],
        exists: exists, // defined above
        value: value, // defined above
        counter: ++context.worldStateAccessTrace.accessCounter,
    }
)
`,
    "Triggers downstream circuit operations":
      "Storage slot siloing (hash with contract address), public data tree membership check",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = field`",
  },
  {
    id: "sstore",
    Name: "`SSTORE`",
    Category: "World State - Public Storage",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      { name: "srcOffset", description: "memory offset of the word to store" },
      {
        name: "slotOffset",
        description: "memory offset containing the storage slot to store to",
      },
    ],
    Expression: `
S[M[slotOffset]] = M[srcOffset]
`,
    Summary: "Write a word to this contract's persistent public storage",
    Details: `
// Expression is shorthand for
context.worldState.publicStorage.set({
    leafIndex: hash(context.environment.address, M[slotOffset]),
    leaf: M[srcOffset],
})
`,
    "World State access tracing": `
context.worldStateAccessTrace.publicStorageWrites.append(
    TracedStorageWrite {
        callPointer: context.environment.callPointer,
        slot: M[slotOffset],
        value: M[srcOffset],
        counter: ++context.worldStateAccessTrace.accessCounter,
    }
)
`,
    "Triggers downstream circuit operations":
      "Storage slot siloing (hash with contract address), public data tree update",
    "Tag checks": "",
    "Tag updates": "",
  },
  {
    id: "notehashexists",
    Name: "`NOTEHASHEXISTS`",
    Category: "World State - Notes & Nullifiers",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      { name: "noteHashOffset", description: "memory offset of the note hash" },
      {
        name: "leafIndexOffset",
        description: "memory offset of the leaf index",
      },
      {
        name: "existsOffset",
        description:
          "memory offset specifying where to store operation's result (whether the note hash leaf exists)",
      },
    ],
    Expression: `
exists = context.worldState.noteHashes.has({
    leafIndex: M[leafIndexOffset]
    leaf: hash(context.environment.address, M[noteHashOffset]),
})
M[existsOffset] = exists
`,
    Summary:
      "Check whether a note hash exists in the note hash tree (as of the start of the current block)",
    "World State access tracing": `
context.worldStateAccessTrace.noteHashChecks.append(
    TracedNoteHashCheck {
        callPointer: context.environment.callPointer,
        leafIndex: M[leafIndexOffset]
        noteHash: M[noteHashOffset],
        exists: exists, // defined above
        counter: ++context.worldStateAccessTrace.accessCounter,
    }
)
`,
    "Triggers downstream circuit operations":
      "Note hash siloing (hash with storage contract address), note hash tree membership check",
    "Tag checks": "",
    "Tag updates": "`T[existsOffset] = u8`",
  },
  {
    id: "emitnotehash",
    Name: "`EMITNOTEHASH`",
    Category: "World State - Notes & Nullifiers",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      { name: "noteHashOffset", description: "memory offset of the note hash" },
    ],
    Expression: `
context.worldState.noteHashes.append(
    hash(context.environment.address, M[noteHashOffset])
)
`,
    Summary: "Emit a new note hash to be inserted into the note hash tree",
    "World State access tracing": `
context.worldStateAccessTrace.noteHashes.append(
    TracedNoteHash {
        callPointer: context.environment.callPointer,
        noteHash: M[noteHashOffset], // unsiloed note hash
        counter: ++context.worldStateAccessTrace.accessCounter,
    }
)
`,
    "Triggers downstream circuit operations":
      "Note hash siloing (hash with contract address), note hash tree insertion.",
    "Tag checks": "",
    "Tag updates": "",
  },
  {
    id: "nullifierexists",
    Name: "`NULLIFIEREXISTS`",
    Category: "World State - Notes & Nullifiers",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "nullifierOffset",
        description: "memory offset of the unsiloed nullifier",
      },
      {
        name: "addressOffset",
        description: "memory offset of the storage address",
      },
      {
        name: "existsOffset",
        description:
          "memory offset specifying where to store operation's result (whether the nullifier exists)",
      },
    ],
    Expression: `
exists = pendingNullifiers.has(M[addressOffset], M[nullifierOffset]) || context.worldState.nullifiers.has(
    hash(M[addressOffset], M[nullifierOffset])
)
M[existsOffset] = exists
`,
    Summary:
      "Check whether a nullifier exists in the nullifier tree (including nullifiers from earlier in the current transaction or from earlier in the current block)",
    "World State access tracing": `
context.worldStateAccessTrace.nullifierChecks.append(
    TracedNullifierCheck {
        callPointer: context.environment.callPointer,
        nullifier: M[nullifierOffset],
        address: M[addressOffset],
        exists: exists, // defined above
        counter: ++context.worldStateAccessTrace.accessCounter,
    }
)
`,
    "Triggers downstream circuit operations":
      "Nullifier siloing (hash with storage contract address), nullifier tree membership check",
    "Tag checks": "",
    "Tag updates": "`T[existsOffset] = u8`",
  },
  {
    id: "emitnullifier",
    Name: "`EMITNULLIFIER`",
    Category: "World State - Notes & Nullifiers",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      { name: "nullifierOffset", description: "memory offset of nullifier" },
    ],
    Expression: `
context.worldState.nullifiers.append(
    hash(context.environment.address, M[nullifierOffset])
)
`,
    Summary: "Emit a new nullifier to be inserted into the nullifier tree",
    "World State access tracing": `
context.worldStateAccessTrace.nullifiers.append(
    TracedNullifier {
        callPointer: context.environment.callPointer,
        nullifier: M[nullifierOffset], // unsiloed nullifier
        counter: ++context.worldStateAccessTrace.accessCounter,
    }
)
`,
    "Triggers downstream circuit operations":
      "Nullifier siloing (hash with contract address), nullifier tree non-membership-check and insertion.",
    "Tag checks": "",
    "Tag updates": "",
  },
  {
    id: "l1tol2msgexists",
    Name: "`L1TOL2MSGEXISTS`",
    Category: "World State - Messaging",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "msgHashOffset",
        description: "memory offset of the message hash",
      },
      {
        name: "msgLeafIndexOffset",
        description:
          "memory offset of the message's leaf index in the L1-to-L2 message tree",
      },
      {
        name: "existsOffset",
        description:
          "memory offset specifying where to store operation's result (whether the message exists in the L1-to-L2 message tree)",
      },
    ],
    Expression: `
exists = context.worldState.l1ToL2Messages.has({
    leafIndex: M[msgLeafIndexOffset], leaf: M[msgHashOffset]
})
M[existsOffset] = exists
`,
    Summary: "Check if a message exists in the L1-to-L2 message tree",
    "World State access tracing": `
context.worldStateAccessTrace.l1ToL2MessagesChecks.append(
    L1ToL2Message {
        callPointer: context.environment.callPointer,
        leafIndex: M[msgLeafIndexOffset],
        msgHash: M[msgHashOffset],
        exists: exists, // defined above
    }
)
`,
    "Triggers downstream circuit operations":
      "L1-to-L2 message tree membership check",
    "Tag checks": "",
    "Tag updates": `
T[existsOffset] = u8,
`,
  },
  {
    id: "getcontractinstance",
    Name: "`GETCONTRACTINSTANCE`",
    Category: "Other",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "addressOffset",
        description: "memory offset of the contract instance address",
      },
      {
        name: "dstOffset",
        description: "location to write the contract instance information to",
      },
    ],
    Expression: `
M[dstOffset:dstOffset+CONTRACT_INSTANCE_SIZE+1] = [
    instance_found_in_address,
    instance.salt ?? 0,
    instance.deployer ?? 0,
    instance.contractClassId ?? 0,
    instance.initializationHash ?? 0,
    instance.portalContractAddress ?? 0,
    instance.publicKeysHash ?? 0,
]
`,
    Summary: "Copies contract instance data to memory",
    "Tag checks": "",
    "Tag updates": "T[dstOffset:dstOffset+CONTRACT_INSTANCE_SIZE+1] = field",
    "Additional AVM circuit checks": "TO-DO",
    "Triggers downstream circuit operations": "TO-DO",
  },
  {
    id: "emitunencryptedlog",
    Name: "`EMITUNENCRYPTEDLOG`",
    Category: "Accrued Substate - Logging",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      { name: "logOffset", description: "memory offset of the data to log" },
      {
        name: "logSizeOffset",
        description: "memory offset to number of words to log",
      },
    ],
    Expression: `
context.accruedSubstate.unencryptedLogs.append(
    UnencryptedLog {
        address: context.environment.address,
        log: M[logOffset:logOffset+M[logSizeOffset]],
    }
)
`,
    Summary: "Emit an unencrypted log",
    "Tag checks": "",
    "Tag updates": "",
  },
  {
    id: "sendl2tol1msg",
    Name: "`SENDL2TOL1MSG`",
    Category: "Accrued Substate - Messaging",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "recipientOffset",
        description: "memory offset of the message recipient",
      },
      {
        name: "contentOffset",
        description: "memory offset of the message content",
      },
    ],
    Expression: `
context.accruedSubstate.sentL2ToL1Messages.append(
    SentL2ToL1Message {
        address: context.environment.address,
        recipient: M[recipientOffset],
        message: M[contentOffset]
    }
)
`,
    Summary: "Send an L2-to-L1 message",
    "Tag checks": "",
    "Tag updates": "",
  },
  {
    id: "call",
    Name: "`CALL`",
    Category: "Control Flow - Contract Calls",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: CALL_INSTRUCTION_ARGS,
    Expression: `
// instr.args are { gasOffset, addrOffset, argsOffset, retOffset, retSize }
chargeGas(context,
          l2GasCost=M[instr.args.gasOffset],
          daGasCost=M[instr.args.gasOffset+1])
traceNestedCall(context, instr.args.addrOffset)
nestedContext = deriveContext(context, instr.args, isStaticCall=false)
execute(nestedContext)
updateContextAfterNestedCall(context, instr.args, nestedContext)
`,
    Summary: "Call into another contract",
    Details:
      `Creates a new (nested) execution context and triggers execution within that context.
                    Execution proceeds in the nested context until it reaches a halt at which point
                    execution resumes in the current/calling context.
                    A non-existent contract or one with no code will return success. ` +
      CALL_INSTRUCTION_DETAILS,
    "Tag checks": "`T[gasOffset] == T[gasOffset+1] == T[gasOffset+2] == u32`",
    "Tag updates": `
T[successOffset] = u8
T[retOffset:retOffset+retSize] = field
`,
  },
  {
    id: "staticcall",
    Name: "`STATICCALL`",
    Category: "Control Flow - Contract Calls",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: CALL_INSTRUCTION_ARGS,
    Expression: `
// instr.args are { gasOffset, addrOffset, argsOffset, retOffset, retSize }
chargeGas(context,
          l2GasCost=M[instr.args.gasOffset],
          daGasCost=M[instr.args.gasOffset+1])
traceNestedCall(context, instr.args.addrOffset)
nestedContext = deriveContext(context, instr.args, isStaticCall=true
execute(nestedContext)
updateContextAfterNestedCall(context, instr.args, nestedContext)
`,
    Summary:
      "Call into another contract, disallowing World State and Accrued Substate modifications",
    Details:
      `Same as \`CALL\`, but disallows World State and Accrued Substate modifications. ` +
      CALL_INSTRUCTION_DETAILS,
    "Tag checks": "`T[gasOffset] == T[gasOffset+1] == T[gasOffset+2] == u32`",
    "Tag updates": `
T[successOffset] = u8
T[retOffset:retOffset+retSize] = field
`,
  },
  {
    id: "return",
    Name: "`RETURN`",
    Category: "Control Flow - Contract Calls",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "retOffset",
        description: "memory offset of first word to return",
      },
      {
        name: "retSize",
        description: "number of words to return",
        mode: "immediate",
        type: "u32",
      },
    ],
    Expression: `
context.contractCallResults.output = M[retOffset:retOffset+retSize]
halt
`,
    Summary:
      "Halt execution within this context (without revert), optionally returning some data",
    Details:
      'Return control flow to the calling context/contract. Caller will accept World State and Accrued Substate modifications. See ["Halting"](./execution#halting) to learn more. See ["Nested contract calls"](./nested-calls) to see how the caller updates its context after the nested call halts.',
    "Tag checks": "",
    "Tag updates": "",
  },
  {
    id: "revert",
    Name: "`REVERT`",
    Category: "Control Flow - Contract Calls",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "retOffset",
        description: "memory offset of first word to return",
      },
      {
        name: "retSize",
        description: "number of words to return",
        mode: "immediate",
        type: "u32",
      },
    ],
    Expression: `
context.contractCallResults.output = M[retOffset:retOffset+retSize]
context.contractCallResults.reverted = true
halt
`,
    Summary:
      "Halt execution within this context as `reverted`, optionally returning some data",
    Details:
      'Return control flow to the calling context/contract. Caller will reject World State and Accrued Substate modifications. See ["Halting"](./execution#halting) to learn more. See ["Nested contract calls"](./nested-calls) to see how the caller updates its context after the nested call halts.',
    "Tag checks": "",
    "Tag updates": "",
  },
  {
    id: "to_radix_le",
    Name: "`TORADIXLE`",
    Category: "Conversions",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "srcOffset",
        description: "memory offset of word to convert.",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where the first limb of the radix-conversion result is stored.",
      },
      {
        name: "radix",
        description: "the maximum bit-size of each limb.",
        mode: "immediate",
        type: "u32",
      },
      {
        name: "numLimbs",
        description: "the number of limbs the word will be converted into.",
        type: "u32",
        mode: "immediate",
      },
    ],

    Expression: `TBD: Storage of limbs and if T[dstOffset] is constrained to U8`,
    Summary: "Convert a word to an array of limbs in little-endian radix form",
    Details:
      "The limbs will be stored in a contiguous memory block starting at `dstOffset`.",
    "Tag checks": "`T[srcOffset] == field`",
  },
];
const INSTRUCTION_SET = INSTRUCTION_SET_RAW.map((instr) => {
  instr["Bit-size"] = instructionSize(instr);
  return instr;
});

module.exports = {
  TOPICS_IN_TABLE,
  TOPICS_IN_SECTIONS,
  INSTRUCTION_SET,
};
