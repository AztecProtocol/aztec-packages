import { Fr } from '@aztec/foundation/fields';

import { TypeTag } from '../../../avm/avm_memory_types.js';
import { Addressing, AddressingMode } from '../../../avm/opcodes/addressing_mode.js';
import { CalldataCopy, Cast, EmitUnencryptedLog, Return, Set } from '../../../avm/opcodes/index.js';
import { encodeToBytecode } from '../../../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../../../avm/serialization/instruction_serialization.js';
import { testCustomBytecode } from '../../../fixtures/custom_bytecode_tester.js';
import { PublicTxSimulationTester } from '../../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: fuzzing explorations', () => {
  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    tester = await PublicTxSimulationTester.create();
  });

  it('Emit unencrypted log simple', async () => {
    const logValues = [11, 12, 13, 14, 15];
    const logSize = logValues.length;

    const logSizeOffset = 0; // offset (memory address) of the log size
    const logOffset = 1; // Memory offset of the 0th word of the log (+1 for first word, etc)

    const instructions = [];
    for (let i = 0; i < logValues.length; i++) {
      // Generate the Set instruction for the ith log value
      // Note: you could use uninitialized memory words too instead! They'd be interpreted as Field(0).
      // Note: you could also instead generate this actual loop in code itself (with JumpIf, Lte, Add, etc)
      instructions.push(
        new Set(/*indirect=*/ 0, /*dstOffset=*/ logOffset + i, TypeTag.FIELD, /*value=*/ logValues[i]).as(
          Opcode.SET_8,
          Set.wireFormat8,
        ),
      );
    }

    instructions.push([
      // Generate the Set instruction for the log size
      new Set(/*indirect=*/ 0, /*dstOffset=*/ logSizeOffset, TypeTag.UINT32, /*value=*/ logSize).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // Emit the log
      new EmitUnencryptedLog(/*indirect=*/ 0, logSizeOffset, logOffset).as(
        Opcode.EMITUNENCRYPTEDLOG,
        EmitUnencryptedLog.wireFormat,
      ),
      // Set 0 return size (u32(0)) for an empty return
      new Set(/*indirect=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
      // Return successfully (but empty)
      new Return(/*indirect=*/ 0, /*returnSizeOffset=*/ 0, /*returnOffset=*/ 0).as(Opcode.RETURN, Return.wireFormat),
    ]);

    const bytecode = encodeToBytecode(instructions);

    const result = await testCustomBytecode(bytecode, tester, 'EmitUnencryptedLogTest');
    expect(result.revertCode.isOK()).toBe(true);
  });

  it('Emit unencrypted log with indirect offset (like a pointer) to log', async () => {
    // Any "offset" (memory address) operand could be indirect and/or relative!
    // We only show an example of "indirect" here, not relative.
    const addressingMode = Addressing.fromModes([
      AddressingMode.DIRECT, // choose log size direct
      AddressingMode.INDIRECT, // choose log offset indirect
    ]);

    const logValues = [11, 12, 13, 14, 15];
    const logSize = logValues.length;

    const logSizeOffset = 0; // offset (memory address) of the log size
    const logIndirectOffset = 1; // _pointer_ to the log (offset to an offset)
    const logDirectOffset = 2; // Memory offset of the 0th word of the log (+1 for first word, etc)

    const instructions = [];
    instructions.push(
      // Create the pointer to the log (logIndirectOffset -> logOffset -> 0th log word)
      new Set(/*indirect=*/ 0, /*dstOffset=*/ logIndirectOffset, TypeTag.UINT32, /*value=*/ logDirectOffset).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
    );
    for (let i = 0; i < logValues.length; i++) {
      // Generate the Set instruction for the ith log value
      instructions.push(
        new Set(/*indirect=*/ 0, /*dstOffset=*/ logDirectOffset + i, TypeTag.FIELD, /*value=*/ logValues[i]).as(
          Opcode.SET_8,
          Set.wireFormat8,
        ),
      );
    }

    instructions.push([
      // Generate the Set instruction for the log size
      new Set(/*indirect=*/ 0, /*dstOffset=*/ logSizeOffset, TypeTag.UINT32, /*value=*/ logSize).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // Indirect log offset, with addressing mode to indicate that.
      new EmitUnencryptedLog(/*indirect=*/ addressingMode.toWire(), logSizeOffset, logIndirectOffset),
      // Set 0 return size (u32(0)) for an empty return
      new Set(/*indirect=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
      // Return successfully (but empty)
      new Return(/*indirect=*/ 0, /*returnSizeOffset=*/ 0, /*returnOffset=*/ 0).as(Opcode.RETURN, Return.wireFormat),
    ]);

    const bytecode = encodeToBytecode(instructions);

    const result = await testCustomBytecode(bytecode, tester, 'EmitUnencryptedLogTest');
    expect(result.revertCode.isOK()).toBe(true);
  });

  it('Emit unencrypted log from calldata', async () => {
    const logValues = [11, 12, 13, 14, 15];
    const logSize = logValues.length;

    const calldata = [logSize, ...logValues].map(logValue => new Fr(logValue));

    const const0Offset = 0; // we'll store a const of 0 at this offset in memory
    const const1Offset = 1; // we'll store a const of 1 at this offset in memory
    const logSizeMemoryOffset = 1000;
    const logValuesMemoryOffset = 1001;

    const bytecode = encodeToBytecode([
      // Store a const of 0 into memory
      new Set(/*indirect=*/ 0, /*dstOffset=*/ const0Offset, TypeTag.UINT32, /*value=*/ 0).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // Store a const of 1 into memory
      new Set(/*indirect=*/ 0, /*dstOffset=*/ const1Offset, TypeTag.UINT32, /*value=*/ 1).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // First copy one word of calldata (the logSize) into memory.
      // One word, hence copySizeOffset = M[const1Offset] = 1
      // Log size lives at offset 0 into calldata (hence cdStartOffset = M[const0Offset] = 0)
      new CalldataCopy(
        /*indirect=*/ 0,
        /*copySizeOffset=*/ const1Offset,
        /*cdStartOffset=*/ const0Offset,
        /*dstOffset=*/ logSizeMemoryOffset,
      ).as(Opcode.CALLDATACOPY, CalldataCopy.wireFormat),
      // Convert the logSize to a u32 (in-place)
      // Note: needs to be 16-bit wire format to accomodate large operands (1000 and 1001).
      //       Wire format is completely orthogonal to the type being cast to!
      //       It is just the number of bits used for the instruction operands in-bytecode.
      new Cast(
        /*indirect=*/ 0,
        /*srcOffset=*/ logSizeMemoryOffset,
        /*dstOffset=*/ logSizeMemoryOffset,
        TypeTag.UINT32,
      ).as(Opcode.CAST_16, Cast.wireFormat16),
      // Then copy the logValues into memory
      // Log values live at offset 1 into calldata (hence cdStartOffset = M[const1Offset] = 1)
      new CalldataCopy(
        /*indirect=*/ 0,
        /*copySizeOffset=*/ logSizeMemoryOffset,
        /*cdStartOffset=*/ const1Offset,
        /*dstOffset=*/ logValuesMemoryOffset,
      ).as(Opcode.CALLDATACOPY, CalldataCopy.wireFormat),
      // Emit the log
      new EmitUnencryptedLog(
        /*indirect=*/ 0,
        /*logSizeOffset=*/ logSizeMemoryOffset,
        /*logOffset=*/ logValuesMemoryOffset,
      ),
      // Set 0 return size (u32(0)) for an empty return
      new Set(/*indirect=*/ 0, /*dstOffset=*/ 0, TypeTag.UINT32, /*value=*/ 0).as(Opcode.SET_8, Set.wireFormat8),
      // Return successfully (but empty)
      new Return(/*indirect=*/ 0, /*returnSizeOffset=*/ 0, /*returnOffset=*/ 0).as(Opcode.RETURN, Return.wireFormat),
    ]);

    const result = await testCustomBytecode(
      bytecode,
      tester,
      'EmitUnencryptedLogTest',
      'EmitUnencryptedLogContract',
      calldata,
    );
    expect(result.revertCode.isOK()).toBe(true);
  });
});
