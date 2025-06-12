const { instructionSize } = require("./InstructionSize");
const gasConstants = require("./avmGasConstants");

// TODO: mode: offset
const TOPICS_IN_TABLE = ["Name", "Summary", "Expression"];
const TOPICS_IN_SECTIONS = [
  "Name",
  "Summary",
  "Category",
  "Opcode",
  "Variants",
  "Flags",
  "Args",
  "Expression",
  "Details",
  "Exceptions",
  "World State access tracing",
  "Additional AVM circuit checks",
  "Triggers downstream circuit operations",
  "Tag checks",
  "Tag updates",
  "Gas cost",
  "Bit-size",
];

const IN_TAG_DESCRIPTION =
  "The [tag/size](../memory-model.mdx#tags-and-tagged-memory) to check inputs against and tag the destination with.";
const IN_TAG_DESCRIPTION_NO_FIELD =
  IN_TAG_DESCRIPTION + " `field` type is NOT supported for this instruction.";
const INDIRECT_FLAG_DESCRIPTION =
  "Toggles whether each memory-offset argument is a relative and/or indirect offset. *[THIS IS OUTDATED - SEE TS SIMULATOR]* Rightmost bit corresponds to 0th offset arg, etc. Indirect offsets result in memory accesses like `M[M[offset]]` instead of the more standard `M[offset]`.";

const CALL_INSTRUCTION_ARGS = [
  {
    name: "l2GasOffset",
    description:
      "memory offset to amount of L2 gas to provide to the callee",
  },
  {
    name: "daGasOffset",
    description:
      "memory offset to amount of DA gas to provide to the callee",
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
  }
];
const CALL_INSTRUCTION_DETAILS = `
    ["Nested contract calls"](../nested-calls.mdx) provides a full explanation of this
    instruction along with the shorthand used in the expression above.
    The explanation includes details on charging gas for nested calls,
    nested context derivation, world state, and updating the parent context
    after the nested call halts.`;

const VARIANT_8 = "Memory offset operands are 8 bits wide. Note that this does not mean that the resolved memory value (read or written) is u8.";
const VARIANT_16 = "Memory offset operands are 16 bits wide. Note that this does not mean that the resolved memory value (read or written) is u16.";
const getSetVariant = (size) => `Immediate 'value' operand is ${size} bits wide. Note that this does not mean that the destination type/tag will necessarily be 'u${size}'.`;
const SET_VARIANT_FF = "Immediate 'value' operand is a full 254-bit field (FF).  Note that this does not mean that the destination type/tag will necessarily be 'field'.";

const INSTRUCTION_SET_RAW = [
  {
    id: "add",
    Name: "`ADD`",
    Category: "Compute - Arithmetic",
    Variants: [
      { name: "ADD_8", description: VARIANT_8 },
      { name: "ADD_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
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
    "Tag checks": "`T[aOffset] == T[bOffset]`",
    "Tag updates": "`T[dstOffset] = T[aOffset]`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_ADD_BASE_L2_GAS }
    ],
  },
  {
    id: "sub",
    Name: "`SUB`",
    Category: "Compute - Arithmetic",
    Variants: [
      { name: "SUB_8", description: VARIANT_8 },
      { name: "SUB_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
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
    Details: "Wraps on underflow",
    "Tag checks": "`T[aOffset] == T[bOffset]`",
    "Tag updates": "`T[dstOffset] = T[aOffset]`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_SUB_BASE_L2_GAS }
    ],
  },
  {
    id: "mul",
    Name: "`MUL`",
    Category: "Compute - Arithmetic",
    Variants: [
      { name: "MUL_8", description: VARIANT_8 },
      { name: "MUL_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
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
    "Tag checks": "`T[aOffset] == T[bOffset]`",
    "Tag updates": "`T[dstOffset] = T[aOffset]`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_MUL_BASE_L2_GAS }
    ],
  },
  {
    id: "div",
    Name: "`DIV`",
    Category: "Compute - Arithmetic",
    Variants: [
      { name: "DIV_8", description: VARIANT_8 },
      { name: "DIV_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
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
    Exceptions: "Exceptional halt if the input is field (is not integral)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset] != field`",
    "Tag updates": "`T[dstOffset] = T[aOffset]`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_DIV_BASE_L2_GAS }
    ],
  },
  {
    id: "fdiv",
    Name: "`FDIV`",
    Category: "Compute - Arithmetic",
    Variants: [
      { name: "FDIV_8", description: VARIANT_8 },
      { name: "FDIV_16", description: VARIANT_16 },
    ],
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
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_FDIV_BASE_L2_GAS }
    ],
  },
  {
    id: "eq",
    Name: "`EQ`",
    Category: "Compute - Comparators",
    Variants: [
      { name: "EQ_8", description: VARIANT_8 },
      { name: "EQ_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
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
        type: "u1",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] == M[bOffset] ? 1 : 0`",
    Summary: "Equality check (a == b)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset]`",
    "Tag updates": "`T[dstOffset] = u1`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_EQ_BASE_L2_GAS }
    ],
  },
  {
    id: "lt",
    Name: "`LT`",
    Category: "Compute - Comparators",
    Variants: [
      { name: "LT_8", description: VARIANT_8 },
      { name: "LT_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
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
        type: "u1",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] < M[bOffset] ? 1 : 0`",
    Summary: "Less-than check (a < b)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset]`",
    "Tag updates": "`T[dstOffset] = u1`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_LT_BASE_L2_GAS }
    ],
  },
  {
    id: "lte",
    Name: "`LTE`",
    Category: "Compute - Comparators",
    Variants: [
      { name: "LTE_8", description: VARIANT_8 },
      { name: "LTE_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
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
        type: "u1",
      },
    ],
    Expression: "`M[dstOffset] = M[aOffset] <= M[bOffset] ? 1 : 0`",
    Summary: "Less-than-or-equals check (a <= b)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset]`",
    "Tag updates": "`T[dstOffset] = u1`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_LTE_BASE_L2_GAS }
    ],
  },
  {
    id: "and",
    Name: "`AND`",
    Category: "Compute - Bitwise",
    Variants: [
      { name: "AND_8", description: VARIANT_8 },
      { name: "AND_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
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
    Exceptions: "Exceptional halt if the input is field (is not integral)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset]`",
    "Tag updates": "`T[dstOffset] = T[aOffset]`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_AND_BASE_L2_GAS }
    ],
  },
  {
    id: "or",
    Name: "`OR`",
    Category: "Compute - Bitwise",
    Variants: [
      { name: "OR_8", description: VARIANT_8 },
      { name: "OR_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
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
    Exceptions: "Exceptional halt if the input is field (is not integral)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset]`",
    "Tag updates": "`T[dstOffset] = T[aOffset]`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_OR_BASE_L2_GAS }
    ],
  },
  {
    id: "xor",
    Name: "`XOR`",
    Category: "Compute - Bitwise",
    Variants: [
      { name: "XOR_8", description: VARIANT_8 },
      { name: "XOR_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
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
    Exceptions: "Exceptional halt if the input is field (is not integral)",
    Details: "",
    "Tag checks": "`T[aOffset] == T[bOffset]`",
    "Tag updates": "`T[dstOffset] = T[aOffset]`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_XOR_BASE_L2_GAS }
    ],
  },
  {
    id: "not",
    Name: "`NOT`",
    Category: "Compute - Bitwise",
    Variants: [
      { name: "NOT_8", description: VARIANT_8 },
      { name: "NOT_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
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
    Exceptions: "Exceptional halt if the input is field (is not integral)",
    Details: "",
    "Tag checks": "`T[aOffset]`",
    "Tag updates": "`T[dstOffset] = T[aOffset]`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_NOT_BASE_L2_GAS }
    ],
  },
  {
    id: "shl",
    Name: "`SHL`",
    Category: "Compute - Bitwise",
    Variants: [
      { name: "SHL_8", description: VARIANT_8 },
      { name: "SHL_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
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
    "Tag checks": `
T[aOffset] != field // is integral
T[bOffset] == u8
`,
    "Tag updates": "`T[dstOffset] = T[aOffset]`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_SHL_BASE_L2_GAS }
    ],
  },
  {
    id: "shr",
    Name: "`SHR`",
    Category: "Compute - Bitwise",
    Variants: [
      { name: "SHR_8", description: VARIANT_8 },
      { name: "SHR_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
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
    "Tag checks": `
T[aOffset] != field // is integral
T[bOffset] == u8
`,
    "Tag updates": "`T[dstOffset] = T[aOffset]`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_SHR_BASE_L2_GAS }
    ],
  },
  {
    id: "cast",
    Name: "`CAST`",
    Category: "Type Conversions",
    Variants: [
      { name: "CAST_8", description: VARIANT_8 },
      { name: "CAST_16", description: VARIANT_16 },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
    ],
    Args: [
      { name: "srcOffset", description: "memory offset of word to cast" },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where to store operation's result",
      },
      { name: "dstTag", description: "The [tag/type](../memory-model.md#tags-and-tagged-memory) to tag the destination with." },
    ],
    Expression: "`M[dstOffset] = cast<dstTag>(M[srcOffset])`",
    Summary: "Type cast",
    Details: "Cast a word in memory based on the `dstTag` specified in the bytecode. Truncates (`M[dstOffset] = M[aOffset] mod 2^dstsize`) when casting to a smaller type, left-zero-pads when casting to a larger type. See [here](../memory-model.md#cast-and-tag-conversions) for more details.",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = dstTag`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_CAST_BASE_L2_GAS }
    ],
  },
  {
    id: "getenvvar",
    Name: "`GETENVVAR`",
    Category: "Execution Environment",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description: "memory offset specifying where to store operation's result",
      },
      {
        name: "varEnum",
        description: "enum value specifying which item to get from the execution environment",
        mode: "immediate",
        type: "u8",
      },
    ],
    Expression: "`M[dstOffset] = context.environment[varEnum]`",
    Summary: "Get an entry from the context's execution environment",
    Details: "`Enum: [ ADDRESS, SENDER, TRANSACTIONFEE, CHAINID, VERSION, BLOCKNUMBER, TIMESTAMP, FEEPERL2GAS, FEEPERDAGAS, ISSTATICCALL, L2GASLEFT, DAGASLEFT ]`",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = varEnum == TIMESTAMP ? u64 : field`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_GETENVVAR_BASE_L2_GAS }
    ],
  },
  {
    id: "calldatacopy",
    Name: "`CALLDATACOPY`",
    Category: "Memory - Calldata & Returndata",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "cdStartOffset",
        description: "calldata offset specifying the first word to copy to memory",
      },
      {
        name: "copySizeOffset",
        description: "number of words to copy to memory",
      },
      {
        name: "dstOffset",
        description: "memory offset specifying where to store the first copied word",
      },
    ],
    Expression: "`M[dstOffset+M[copySizeOffset]] = context.environment.calldata[cdStartOffset+M[copySizeOffset]]`",
    Summary: "Copy a range of words from calldata to memory",
    Details: "If the copy would surpass the bounds of calldata, the result is zero-padded to copySizeOffset.",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset+M[copySizeOffset]] = field`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_CALLDATACOPY_BASE_L2_GAS },
      { name: "Dynamic L2 Gas", description: gasConstants.AVM_CALLDATACOPY_DYN_L2_GAS }
    ],
  },
  {
    id: "successcopy",
    Name: "`SUCCESSCOPY`",
    Category: "Memory - Calldata & Returndata",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description: "memory offset specifying where to store the success flag of the most recent nested call",
        type: "u1",
      },
    ],
    Expression: "`M[dstOffset] = context.machineState.nestedCallSuccess ? 1 : 0`",
    Summary: "Copy the success status of the most recent nested call",
    Details: "Copies the success status of the most recent nested call to the specified memory location. The value is 1 for success or 0 for failure.",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = u1`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_SUCCESSCOPY_BASE_L2_GAS }
    ],
  },
  {
    id: "returndatasize",
    Name: "`RETURNDATASIZE`",
    Category: "Memory - Calldata & Returndata",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description: "memory offset specifying where to store the first copied word",
      },
    ],
    Expression: "`M[dstOffset] = context.machineState.nestedReturndata.length`",
    Summary: "Get the size of the returndata buffer",
    Details: "The returndata buffer holds the returndata from only the latest nested call. If no nested call has been made yet from this context, size zero.",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset+M[copySizeOffset]] = u32`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_RETURNDATASIZE_BASE_L2_GAS }
    ],
  },
  {
    id: "returndatacopy",
    Name: "`RETURNDATACOPY`",
    Category: "Memory - Calldata & Returndata",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "rdStartOffset",
        description: "returndata offset specifying the first word to copy to memory",
      },
      {
        name: "copySizeOffset",
        description: "number of words to copy to memory",
      },
      {
        name: "dstOffset",
        description: "memory offset specifying where to store the first copied word",
      },
    ],
    Expression: "`M[dstOffset+M[copySizeOffset]] = context.machineState.nestedReturndata[rdStartOffset+M[copySizeOffset]]`",
    Summary: "Copy a range of words from returndata to memory",
    Details: "The returndata buffer holds the returndata from only the latest nested call. If the copy would surpass the bounds of returndata, the result is zero-padded to copySizeOffset.",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset+M[copySizeOffset]] = field`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_RETURNDATACOPY_BASE_L2_GAS },
      { name: "Dynamic L2 Gas", description: gasConstants.AVM_RETURNDATACOPY_DYN_L2_GAS }
    ],
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
    Expression: "`context.machineState.pc = M[jumpOffset]`",
    Summary: "Jump to a location in the bytecode",
    Details: "Target location is an immediate value (a constant in the bytecode).",
    "Tag checks": "",
    "Tag updates": "",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_JUMP_BASE_L2_GAS }
    ],
  },
  {
    id: "jumpi",
    Name: "`JUMPI`",
    Category: "Machine State - Control Flow",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "loc",
        description: "target location to conditionally jump to",
        mode: "immediate",
        type: "u32",
      },
      {
        name: "condOffset",
        description: "memory offset of the operations 'conditional' input",
      },
    ],
    Expression: "`if M[condOffset] > 0: context.machineState.pc = loc`",
    Summary: "Conditionally jump to a location in the bytecode",
    Details: "Target location is an immediate value (a constant in the bytecode). `T[condOffset]` is not checked because the greater-than-zero suboperation is the same regardless of type.",
    "Tag checks": "",
    "Tag updates": "",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_JUMPI_BASE_L2_GAS }
    ],
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
context.machineState.internalCallStack.push(context.machineState.nextPc)
context.machineState.pc = loc
`,
    Summary:
      "Make an internal call. Push the next PC to the internal call stack and jump to the target location.",
    Details:
      "Target location is an immediate value (a constant in the bytecode).",
    "Tag checks": "",
    "Tag updates": "",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_INTERNALCALL_BASE_L2_GAS }
    ],
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
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_INTERNALRETURN_BASE_L2_GAS }
    ],
  },
  {
    id: "set",
    Name: "`SET`",
    Category: "Machine State - Memory",
    Variants: [
      { name: "SET_8", description: getSetVariant(8) },
      { name: "SET_16", description: getSetVariant(16) },
      { name: "SET_32", description: getSetVariant(32) },
      { name: "SET_64", description: getSetVariant(64) },
      { name: "SET_128", description: getSetVariant(128) },
      { name: "SET_FF", description: SET_VARIANT_FF },
    ],
    Flags: [
      { name: "indirect", description: INDIRECT_FLAG_DESCRIPTION },
    ],
    Args: [
      {
        name: "dstOffset",
        description: "memory offset specifying where to store `value`",
      },
      {
        name: "inTag",
        description:
          "The [type/size](../memory-model.md#tags-and-tagged-memory) to cast `value` to and to tag the destination with.",
      },
      {
        name: "value",
        description:
          "an constant value from the bytecode to store in memory",
        mode: "immediate",
      },
    ],
    Expression: "`M[dstOffset] = cast<inTag>(value)`",
    Summary: "Set a word in memory from a constant in the bytecode",
    Details: "",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = inTag`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_SET_BASE_L2_GAS }
    ],
  },
  {
    id: "mov",
    Name: "`MOV`",
    Category: "Machine State - Memory",
    Variants: [
      { name: "MOV_8", description: VARIANT_8 },
      { name: "MOV_16", description: VARIANT_16 },
    ],
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      { name: "srcOffset", description: "memory offset of the word to move" },
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
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_MOV_BASE_L2_GAS }
    ],
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
      "Load a word from this contract's persistent public storage. If this slot has never been written before, the value zero is loaded.",
    Details: "Silo the storage slot (hash with contract address), and perform a membership check in the public data tree.",
    "Tag checks": "",
    "Tag updates": "`T[dstOffset] = field`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_SLOAD_BASE_L2_GAS }
    ],
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
    Exceptions: "Exceptional halt if this instruction occurs during a static call's execution (`context.environment.isStaticCall == true`). Exceptional halt if the transaction has reached the limit on the number of storage writes per transaction.",
    Details: "Silo the storage slot (hash with contract address), and perform a merkle insertion in the public data tree.",
    "Tag checks": "",
    "Tag updates": "",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_SSTORE_BASE_L2_GAS },
      { name: "Base DA Gas", description: gasConstants.AVM_SSTORE_BASE_DA_GAS }
    ],
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
siloedNoteHash = hash(context.environment.address, M[noteHashOffset])
gotSiloedNoteHash = context.worldState.noteHashes.get(/*leafIndex=*/ M[leafIndexOffset])
exists = siloedNoteHash == gotSiloedNoteHash
M[existsOffset] = exists
`,
    Summary:
      "Check whether a note hash exists in the note hash tree",
    Details: "Silo the note hash (hash with storage contract address), and perform a membership check of the note hash tree",
    "Tag checks": "`T[noteHashOffset] == T[leafIndexOffset] == field`",
    "Tag updates": "`T[existsOffset] = u1`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_NOTEHASHEXISTS_BASE_L2_GAS }
    ],
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
    Summary: "Insert a new note hash into the note hash tree",
    Exceptions: "Exceptional halt if this instruction occurs during a static call's execution (`context.environment.isStaticCall == true`). Exceptional halt if the transaction has reached the limit on the number of note hashes per transaction.",
    Details: "Silo the note hash (hash with contract address), make it unique (hash with nonce) and insert into note hash tree.",
    "Tag checks": "`T[nullifierOffset] == field`",
    "Tag updates": "",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_EMITNOTEHASH_BASE_L2_GAS },
      { name: "Base DA Gas", description: gasConstants.AVM_EMITNOTEHASH_BASE_DA_GAS }
    ],
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
exists = context.worldState.nullifiers.has(
    hash(M[addressOffset], M[nullifierOffset])
)
M[existsOffset] = exists
`,
    Summary: "Check whether a nullifier exists in the nullifier tree",
    Details: "Silo nullifier (hash with storage contract address), check membership in the nullifier tree",
    "Tag checks": "`T[nullifierOffset] == T[addressOffset] == field`",
    "Tag updates": "`T[existsOffset] = u1`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_NULLIFIEREXISTS_BASE_L2_GAS }
    ],
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
    Summary: "Insert a new nullifier into the nullifier tree",
    Exceptions: "Exceptional halt if the specified nullifier already exists or if this instruction occurs during a static call's execution (`context.environment.isStaticCall == true`). Exceptional halt if the transaction has reached the limit on the number of nullifiers per transaction.",
    Details: "Silo nullifier (hash with contract address), assert non-membership and insert into nullifier tree.",
    "Tag checks": "`T[nullifierOffset] == field`",
    "Tag updates": "",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_EMITNULLIFIER_BASE_L2_GAS },
      { name: "Base DA Gas", description: gasConstants.AVM_EMITNULLIFIER_BASE_DA_GAS }
    ],
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
    "Tag checks": "`T[msgHashOffset] == T[msgLeafIndexOffset] == field`",
    "Tag updates": "`T[existsOffset] = u1`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_L1TOL2MSGEXISTS_BASE_L2_GAS }
    ],
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
        description: "location to write the contract instance member to",
      },
      {
        name: "existsOffset",
        description:
          "memory offset specifying where to store whether the contract instance exists",
      },
      {
        name: "memberEnum",
        description: "enum value specifying which item to get from the specified contract instance (DEPLOYER, CLASS_ID, INIT_HASH)",
        mode: "immediate",
        type: "u8",
      },
    ],
    Expression: "`M[dstOffset] = context.worldState.contracts.get(M[addressOffset])[memberEnum]`",
    Summary: "Get a member from the contract instance at the specified address",
    Exceptions: "Exceptional halt if the transaction has reached the limit on the number of unique contract class IDs that can be accessed per transaction.",
    Details: "M[dstOffset] will be assigned zero if the contract instance does not exist or if memberEnum is invalid.",
    "Tag checks": "`T[addressOffset] == field`",
    "Tag updates": "`T[dstOffset] = field; T[existsOffset] = u1`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_GETCONTRACTINSTANCE_BASE_L2_GAS }
    ],
  },
  {
    id: "emitpubliclog",
    Name: "`EMITPUBLICLOG`",
    Category: "World state - Logs",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      { name: "logOffset", description: "memory offset of the data to log" },
      {
        name: "logSizeOffset",
        description: "memory offset to number of words to log",
      },
    ],
    Expression: `
context.worldState.publicLogs.append(
    PublicLog {
        address: context.environment.address,
        log: M[logOffset:logOffset+M[logSizeOffset]],
    }
)
`,
    Summary: "Emit a public log",
    Exceptions: "Exceptional halt if this instruction occurs during a static call's execution (`context.environment.isStaticCall == true`). Exceptional halt if the transaction has reached the limit on the number of public logs per transaction, or if the log size exceeds the maximum allowed size per log.",
    Details: "",
    "Tag checks": "`T[logSizeOffset] == u32 && T[logOffset:logOffset+M[logSizeOffset]] == field`",
    "Tag updates": "",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_EMITUNENCRYPTEDLOG_BASE_L2_GAS },
      { name: "Dynamic L2 Gas", description: gasConstants.AVM_EMITUNENCRYPTEDLOG_DYN_L2_GAS },
      { name: "Dynamic DA Gas", description: gasConstants.AVM_EMITUNENCRYPTEDLOG_DYN_DA_GAS }
    ],
  },
  {
    id: "sendl2tol1msg",
    Name: "`SENDL2TOL1MSG`",
    Category: "World state - Messaging",
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
context.worldState.l2ToL1Messages.append(
    L2ToL1Message {
        recipientAddress: M[recipientOffset],
        content: M[contentOffset]
    }.scope(context.environment.address)
)
`,
    Summary: "Send an L2-to-L1 message",
    Exceptions: "Exceptional halt if this instruction occurs during a static call's execution (`context.environment.isStaticCall == true`). Exceptional halt if the transaction has reached the limit on the number of L2 to L1 messages per transaction.",
    "Tag checks": "`T[recipientOffset] == T[contentOffset] == field`",
    "Tag updates": "",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_SENDL2TOL1MSG_BASE_L2_GAS },
      { name: "Base DA Gas", description: gasConstants.AVM_SENDL2TOL1MSG_BASE_DA_GAS }
    ],
  },
  {
    id: "call",
    Name: "`CALL`",
    Category: "Control Flow - External Contract Calls",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: CALL_INSTRUCTION_ARGS,
    Expression: `
contractAddress = M[addrOffset]
allocatedGas = { l2Gas: M[gasOffset], daGas: M[gasOffset+1] }
calldata = M[argsOffset:argsOffset+M[argsSizeOffset]]
isStaticCall = context.environment.isStaticCall
nestedContext = context.createNestedContractCallContext(contractAddress, calldata, allocatedGas, isStaticCall)
results = execute(nestedContext)
context.machineState.nestedCallSuccess = !results.reverted
context.machineState.nestedReturndata = results.output
`,
    Summary: "Call into another contract",
    Details:
      `Creates a new (nested) execution context and triggers execution within that context.
                    Execution proceeds in the nested context until it reaches a halt at which point
                    execution resumes in the current/calling context.
                    A subsequent SUCCESSCOPY can be used to check if the contract call succeeded or reverted.
                    When either a non-existent contract, or one with no code is called,
                    the nested call itself will exceptionally halt, but importantly THIS call instruction will NOT exceptionally halt.
                    In that case, a subsequent SUCCESSCOPY will return 0 (failure).
                    ` +
      CALL_INSTRUCTION_DETAILS,
    "Tag checks": `
T[gasOffset] == T[gasOffset+1] == field
T[addrOffset] == field
T[argsSizeOffset] == u32
`,
    "Tag updates": "`T[successOffset] = u1`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_CALL_BASE_L2_GAS },
      { name: "Dynamic L2 Gas", description: gasConstants.AVM_CALL_DYN_L2_GAS }
    ],
  },
  {
    id: "staticcall",
    Name: "`STATICCALL`",
    Category: "Control Flow - External Contract Calls",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: CALL_INSTRUCTION_ARGS,
    Expression: `
contractAddress = M[addrOffset]
allocatedGas = { l2Gas: M[gasOffset], daGas: M[gasOffset+1] }
calldata = M[argsOffset:argsOffset+M[argsSizeOffset]]
isStaticCall = true
nestedContext = context.createNestedContractCallContext(contractAddress, calldata, allocatedGas, isStaticCall)
output = execute(nestedContext)
context.machineState.nestedReturndata = output
`,
    Summary:
      "Call into another contract, disallowing World State modifications",
    Details:
      `Same as \`CALL\`, but disallows World State modifications. ` +
      CALL_INSTRUCTION_DETAILS,
    "Tag checks": `
T[gasOffset] == T[gasOffset+1] == field
T[addrOffset] == field
T[argsSizeOffset] == u32
`,
    "Tag updates": "`T[successOffset] = u1`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_STATICCALL_BASE_L2_GAS },
      { name: "Dynamic L2 Gas", description: gasConstants.AVM_STATICCALL_DYN_L2_GAS }
    ],
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
        name: "retSizeOffset",
        description: "memory offset for the number of words to return",
      },
    ],
    Expression: `
context.contractCallResults.output = M[retOffset:retOffset+retSize]
halt
`,
    Summary: "Halt execution within this context (without revert), optionally returning some data",
    Details: 'Return control flow to the calling context/contract. Caller will accept World State modifications. See ["Halting"](../execution.md#halting) to learn more. See ["Nested contract calls"](../nested-calls.mdx) to see how the caller updates its context after the nested call halts.',
    "Tag checks": "`T[returnSizeOffset] == u32`",
    "Tag updates": "",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_RETURN_BASE_L2_GAS },
      { name: "Dynamic L2 Gas", description: gasConstants.AVM_RETURN_DYN_L2_GAS }
    ],
  },
  {
    id: "revert",
    Name: "`REVERT`",
    Category: "Control Flow - Contract Calls",
    Variants: [
      { name: "REVERT_8", description: VARIANT_8 },
      { name: "REVERT_16", description: VARIANT_16 },
    ],
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "retOffset",
        description: "memory offset of first word to return",
      },
      {
        name: "retSize",
        description: "memory offset for the number of words to return",
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
      'Return control flow to the calling context/contract. Caller will reject World State modifications. See ["Halting"](../execution.md#halting) to learn more. See ["Nested contract calls"](../nested-calls.mdx) to see how the caller updates its context after the nested call halts.',
    "Tag checks": "`T[returnSizeOffset] == u32`",
    "Tag updates": "",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_REVERT_BASE_L2_GAS },
      { name: "Dynamic L2 Gas", description: gasConstants.AVM_REVERT_DYN_L2_GAS }
    ],
  },
  {
    id: "debuglog",
    Name: "`DEBUGLOG`",
    Category: "Debugging",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "messageOffset",
        description: "memory offset of first word in the debug message",
      },
      {
        name: "fieldsOffset",
        description: "memory offset of first field to format into the debug message",
      },
      {
        name: "fieldsSizeOffset",
        description: "memory offset of number of fields to be formatted into the debug message",
      },
      {
        name: "messageSize",
        description: "number of characters in the debug message at messageOffset",
        mode: "immediate",
        type: "u16",
      },
    ],
    Expression: `debug log`,
    Summary: "Print a debug logging message.",
    Details: "Eventually, except during client-side simulation, this opcode should just be a no-op (jump to next). Each memory word in 'message' is interpreted as a character code. The message string is then interpreted as a formattable string like 'My debug string with some fields: {0} {1}', where '{0}' will be filled in with the 0th field referenced by fieldsOffset.",
    "Tag checks": `
T[fieldsSizeOffset] == u32
T[messageOffset:messageOffset+messageSize] == u8
T[fieldsOffset:fieldsOffset+fieldsSizeOffset] == field
`,
    "Tag updates": "",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_DEBUGLOG_BASE_L2_GAS },
      { name: "Dynamic L2 Gas", description: gasConstants.AVM_DEBUGLOG_DYN_L2_GAS }
    ],
  },
  {
    id: "poseidon2permutation",
    Name: "`POSEIDON2PERMUTATION`",
    Category: "Conversions",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "inputStateOffset",
        description: "memory offset of the input state (4 contiguous field elements).",
      },
      {
        name: "outputStateOffset",
        description: "memory offset specifying where to store operation's result (4 contiguous field elements).",
      },
    ],
    Expression: `
M[outputStateOffset:outputStateOffset+4] = poseidon2Permutation(M[inputStateOffset:inputStateOffset+4])
`,
    Summary: "Apply the Poseidon2 permutation function",
    Details: "Applies the Poseidon2 permutation to 4 fields. Used as part of Poseidon2 hashes.",
    "Tag checks": "`T[inputStateOffset:inputStateOffset+4] == field`",
    "Tag updates": "`T[outputStateOffset:outputStateOffset+4] = field`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_POSEIDON2_BASE_L2_GAS }
    ],
  },
  {
    id: "sha256compression",
    Name: "`SHA256COMPRESSION`",
    Category: "Hashing",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "outputOffset",
        description: "memory offset specifying where to store the compressed state (8 contiguous u32 words)",
      },
      {
        name: "stateOffset",
        description: "memory offset of the input state (8 contiguous u32 words)",
      },
      {
        name: "inputsOffset",
        description: "memory offset of the message block (16 contiguous u32 words)",
      },
    ],
    Expression: `
M[outputOffset:outputOffset+8] = sha256Compression(
    state: M[stateOffset:stateOffset+8],
    inputs: M[inputsOffset:inputsOffset+16]
)
`,
    Summary: "Apply the SHA-256 compression function",
    Details: "Applies a single round of the SHA-256 compression function to an 8-word state and a 16-word message block. This instruction is used as part of SHA-256 hash computation.",
    "Tag checks": "`T[stateOffset:stateOffset+8] == T[inputsOffset:inputsOffset+16] == u32`",
    "Tag updates": "`T[outputOffset:outputOffset+8] = u32`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_SHA256COMPRESSION_BASE_L2_GAS }
    ],
  },
  {
    id: "keccakf1600",
    Name: "`KECCAKF1600`",
    Category: "Hashing",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "dstOffset",
        description: "memory offset specifying where to store operation's result (25 contiguous u64 words)",
      },
      {
        name: "inputOffset",
        description: "memory offset of the input state (25 contiguous u64 words)",
      },
    ],
    Expression: `
M[dstOffset:dstOffset+25] = keccakf1600(M[inputOffset:inputOffset+25])
`,
    Summary: "Apply the Keccakf1600 permutation",
    Details: "Applies the Keccak-f[1600] permutation to a 1600-bit (25 uint64 words) input state. This is the core permutation used in SHA-3 and Keccak hash functions.",
    "Tag checks": "`T[inputOffset:inputOffset+25] == u64`",
    "Tag updates": "`T[dstOffset:dstOffset+25] = u64`",
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_KECCAKF1600_BASE_L2_GAS }
    ],
  },
  {
    id: "ecadd",
    Name: "`ECADD`",
    Category: "Elliptic Curve Operations",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "p1XOffset",
        description: "memory offset of the x-coordinate of the first point",
      },
      {
        name: "p1YOffset",
        description: "memory offset of the y-coordinate of the first point",
      },
      {
        name: "p1IsInfiniteOffset",
        description: "memory offset of the infinity flag of the first point",
        type: "u1",
      },
      {
        name: "p2XOffset",
        description: "memory offset of the x-coordinate of the second point",
      },
      {
        name: "p2YOffset",
        description: "memory offset of the y-coordinate of the second point",
      },
      {
        name: "p2IsInfiniteOffset",
        description: "memory offset of the infinity flag of the second point",
        type: "u1",
      },
      {
        name: "dstOffset",
        description: "memory offset specifying where to store operation's result (three contiguous words: x, y, isInfinite)",
      },
    ],
    Expression: `
 {
     x: M[dstOffset],
     y: M[dstOffset+1],
     isInfinite: M[dstOffset+2],
 } = ecAdd(
     M[p1XOffset], M[p1YOffset], M[p1IsInfiniteOffset],
     M[p2XOffset], M[p2YOffset], M[p2IsInfiniteOffset],
 )
 `,
    Summary: "Add two points on the Grumpkin elliptic curve",
    "Tag checks": `
 T[p1XOffset] == T[p1YOffset] == T[p2XOffset] == T[p2YOffset] == field
 T[p1IsInfiniteOffset] == T[p2IsInfiniteOffset] == u1
 `,
    "Tag updates": `
 T[dstOffset] = field
 T[dstOffset+1] = field
 T[dstOffset+2] = u1
 `,
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_ECADD_BASE_L2_GAS }
    ],
  },
  {
    id: "toradixbe",
    Name: "`TORADIXBE`",
    Category: "Conversions",
    Flags: [{ name: "indirect", description: INDIRECT_FLAG_DESCRIPTION }],
    Args: [
      {
        name: "srcOffset",
        description: "memory offset of word to convert.",
      },
      {
        name: "radixOffset",
        description: "memory offset to the radix (maximum bit-size of each limb).",
      },
      {
        name: "numLimbsOffset",
        description: "memory offset to the number of limbs the word will be converted into.",
      },
      {
        name: "outputBitsOffset",
        description:
          "memory offset to the a boolean whether the output should be in bits format (1 bit per memory word)",
      },
      {
        name: "dstOffset",
        description:
          "memory offset specifying where the first limb of the radix-conversion result is stored.",
      },
    ],
    Expression: `
 M[dstOffset:dstOffset+M[numLimbsOffset]] = toRadixBe<M[radixOffset], M[numLimbsOffset], M[outputBitsOffset]>(M[srcOffset])
 `,
    Summary: "Convert a word to an array of limbs in little-endian radix form",
    Exceptions: "Exceptional halt if radix < 2 or radix > 256, if numLimbs < 1 but M[srcOffset] is nonzero, if outputBits is true but radix is not 2",
    Details: `
 value = M[srcOffset]
 radix = M[radixOffset]
 numLimbs = M[numLimbsOffset]
 for (let i = numLimbs - 1; i >= 0; i--) {
   const limb = value % radix;
   M[dstOffset+i] = limb;
   value /= radix;
 }
 `,
    "Tag checks": `
 T[srcOffset] == field
 T[radixOffset] == u32
 T[numLimbsOffset] == u32
 T[outputBitsOffset] == u1
 `,
    "Tag updates": `T[dstOffset:dstOffset+M[numLimbsOffset]] = M[outputBitsOffset] ? u1 : u8`,
    "Gas cost": [
      { name: "Base L2 Gas", description: gasConstants.AVM_TORADIXBE_BASE_L2_GAS },
      { name: "Dynamic L2 Gas", description: gasConstants.AVM_TORADIXBE_DYN_L2_GAS }
    ],
  },
];

function toOpcode(index) {
  return "0x" + index.toString(16).padStart(2, "0");
}

/**
 * Instructions with only one/no variant use 1 opcode.
 * Instructions with multiple variants use 1 opcode per variant.
 * Add `opcode: <opcode>` to each variant-less opcode.
 * Add `opcode: <opcode>` to each variant.
 */
function addOpcodes() {
  let opcode = 0;
  for (let i = 0; i < INSTRUCTION_SET_RAW.length; i++) {
    const instr = INSTRUCTION_SET_RAW[i];
    if (instr.Variants) {
      for (let v = 0; v < instr.Variants.length; v++) {
        instr.Variants[v].Opcode = `\`${toOpcode(opcode)}\``;
        opcode += 1;
      }
    } else {
      instr.Opcode = `\`${toOpcode(opcode)}\``;
      opcode += 1;
    }
  }
}

function modifiedInstructionSet() {
  addOpcodes();
  // TODO: bit-sizes are totally wrong. Need to fix indirect's size (different per opcode)
  // and take into consideration opcode "variants".
  //return INSTRUCTION_SET_RAW.map((instr) => {
  //  instr["Bit-size"] = instructionSize(instr);
  //  return instr;
  //});
  return INSTRUCTION_SET_RAW;
}

const INSTRUCTION_SET = modifiedInstructionSet();

module.exports = {
  TOPICS_IN_TABLE,
  TOPICS_IN_SECTIONS,
  INSTRUCTION_SET,
};
