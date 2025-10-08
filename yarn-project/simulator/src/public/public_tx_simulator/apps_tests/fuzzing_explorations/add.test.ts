import { Fr } from '@aztec/foundation/fields';

import { TypeTag } from '../../../avm/avm_memory_types.js';
import { Addressing, AddressingMode } from '../../../avm/opcodes/addressing_mode.js';
import { Add, CalldataCopy, Cast, Return, Set } from '../../../avm/opcodes/index.js';
import { encodeToBytecode } from '../../../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../../../avm/serialization/instruction_serialization.js';
import { testCustomBytecode } from '../../../fixtures/custom_bytecode_tester.js';
import { PublicTxSimulationTester } from '../../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: fuzzing explorations', () => {
  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    tester = await PublicTxSimulationTester.create();
  });

  it('Add simple', async () => {
    const aValue = 10;
    const bValue = 20;

    const aOffset = 0;
    const bOffset = 1;
    const resultOffset = 2;
    const returnSizeOffset = 3;

    const bytecode = encodeToBytecode([
      // Set value of a
      new Set(/*indirect=*/ 0, /*dstOffset=*/ aOffset, TypeTag.FIELD, /*value=*/ aValue).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // Set value of b
      new Set(/*indirect=*/ 0, /*dstOffset=*/ bOffset, TypeTag.FIELD, /*value=*/ bValue).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // Add a + b
      new Add(/*indirect=*/ 0, /*aOffset=*/ aOffset, /*bOffset=*/ bOffset, /*dstOffset=*/ resultOffset).as(
        Opcode.ADD_8,
        Add.wireFormat8,
      ),
      // Set return size to 1 to return sum
      new Set(/*indirect=*/ 0, /*dstOffset=*/ returnSizeOffset, TypeTag.UINT32, /*value=*/ 1).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // Return successfully with one field element
      new Return(/*indirect=*/ 0, /*returnSizeOffset=*/ returnSizeOffset, /*returnOffset=*/ resultOffset).as(
        Opcode.RETURN,
        Return.wireFormat,
      ),
    ]);

    const result = await testCustomBytecode(bytecode, tester, 'AddTest');
    expect(result.revertCode.isOK()).toBe(true);
    expect(result.processedPhases[0].returnValues[0].values).toEqual([new Fr(aValue + bValue)]);
  });

  it('Add with indirect offset (like a pointer)', async () => {
    const addressingMode = Addressing.fromModes([
      AddressingMode.INDIRECT, // a offset is indirect
      AddressingMode.DIRECT, // b offset is direct
      AddressingMode.DIRECT, // result offset is direct
    ]);

    const aValue = 15;
    const bValue = 25;

    const aIndirectOffset = 0; // pointer to a
    const aDirectOffset = 1; // actual location of a
    const bOffset = 2;
    const resultOffset = 3;
    const returnSizeOffset = 4;

    const bytecode = encodeToBytecode([
      // Create the pointer to a (aIndirectOffset -> aDirectOffset -> value)
      new Set(/*indirect=*/ 0, /*dstOffset=*/ aIndirectOffset, TypeTag.UINT32, /*value=*/ aDirectOffset).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // Set value of a at direct offset
      new Set(/*indirect=*/ 0, /*dstOffset=*/ aDirectOffset, TypeTag.FIELD, /*value=*/ aValue).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // Set value of b
      new Set(/*indirect=*/ 0, /*dstOffset=*/ bOffset, TypeTag.FIELD, /*value=*/ bValue).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // Add a + b with indirect addressing for a
      new Add(
        /*indirect=*/ addressingMode.toWire(),
        /*aOffset=*/ aIndirectOffset,
        /*bOffset=*/ bOffset,
        /*dstOffset=*/ resultOffset,
      ).as(Opcode.ADD_8, Add.wireFormat8),
      // Set return size to 1 to return sum
      new Set(/*indirect=*/ 0, /*dstOffset=*/ returnSizeOffset, TypeTag.UINT32, /*value=*/ 1).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // Return successfully (with one field element: the sum)
      new Return(/*indirect=*/ 0, /*returnSizeOffset=*/ returnSizeOffset, /*returnOffset=*/ resultOffset).as(
        Opcode.RETURN,
        Return.wireFormat,
      ),
    ]);

    const result = await testCustomBytecode(bytecode, tester, 'AddTest');
    expect(result.revertCode.isOK()).toBe(true);
    expect(result.processedPhases[0].returnValues[0].values).toEqual([new Fr(aValue + bValue)]);
  });

  it('Add from calldata', async () => {
    const aValue = 42;
    const bValue = 58;

    const calldata = [aValue, bValue].map(value => new Fr(value));

    const const0Offset = 0; // const of 0
    const const1Offset = 1; // const of 1
    const const2Offset = 2; // const of 2
    const aMemoryOffset = 1000;
    const bMemoryOffset = 1001;
    const resultOffset = 1002;

    const bytecode = encodeToBytecode([
      // Store consts into memory (use 16-bit wire format for large offsets)
      new Set(/*indirect=*/ 0, /*dstOffset=*/ const0Offset, TypeTag.UINT32, /*value=*/ 0).as(
        Opcode.SET_16,
        Set.wireFormat16,
      ),
      new Set(/*indirect=*/ 0, /*dstOffset=*/ const1Offset, TypeTag.UINT32, /*value=*/ 1).as(
        Opcode.SET_16,
        Set.wireFormat16,
      ),
      new Set(/*indirect=*/ 0, /*dstOffset=*/ const2Offset, TypeTag.UINT32, /*value=*/ 2).as(
        Opcode.SET_16,
        Set.wireFormat16,
      ),
      // Copy calldata[0] (aValue) into memory
      new CalldataCopy(
        /*indirect=*/ 0,
        /*copySizeOffset=*/ const1Offset, // copy 1 word
        /*cdStartOffset=*/ const0Offset, // from calldata offset 0
        /*dstOffset=*/ aMemoryOffset,
      ).as(Opcode.CALLDATACOPY, CalldataCopy.wireFormat),
      // Convert aValue to a field (in-place)
      new Cast(/*indirect=*/ 0, /*srcOffset=*/ aMemoryOffset, /*dstOffset=*/ aMemoryOffset, TypeTag.FIELD).as(
        Opcode.CAST_16,
        Cast.wireFormat16,
      ),
      // Copy calldata[1] (bValue) into memory
      new CalldataCopy(
        /*indirect=*/ 0,
        /*copySizeOffset=*/ const1Offset, // copy 1 word
        /*cdStartOffset=*/ const1Offset, // from calldata offset 1
        /*dstOffset=*/ bMemoryOffset,
      ).as(Opcode.CALLDATACOPY, CalldataCopy.wireFormat),
      // Convert bValue to a field (in-place)
      new Cast(/*indirect=*/ 0, /*srcOffset=*/ bMemoryOffset, /*dstOffset=*/ bMemoryOffset, TypeTag.FIELD).as(
        Opcode.CAST_16,
        Cast.wireFormat16,
      ),
      // Add a + b
      new Cast(/*indirect=*/ 0, /*srcOffset=*/ const2Offset, /*dstOffset=*/ const2Offset, TypeTag.UINT32).as(
        Opcode.CAST_16,
        Cast.wireFormat16,
      ),
      new Add(/*indirect=*/ 0, /*aOffset=*/ aMemoryOffset, /*bOffset=*/ bMemoryOffset, /*dstOffset=*/ resultOffset).as(
        Opcode.ADD_16,
        Add.wireFormat16,
      ),
      // Return successfully (with one field element: the sum)
      new Return(/*indirect=*/ 0, /*returnSizeOffset=*/ const1Offset, /*returnOffset=*/ resultOffset).as(
        Opcode.RETURN,
        Return.wireFormat,
      ),
    ]);

    const result = await testCustomBytecode(bytecode, tester, 'AddTest', 'AddContract', calldata);
    expect(result.revertCode.isOK()).toBe(true);
    expect(result.processedPhases[0].returnValues[0].values).toEqual([new Fr(aValue + bValue)]);
  });

  // Note: This test correctly triggers a tag mismatch error during ADD execution:
  // "Tag mismatch at offset 1, got UINT32, expected FIELD"
  // However, there's a bug in the test framework where after an exceptional halt,
  // the framework throws "Cannot read properties of undefined (reading 'toBigInt')"
  // when trying to process the result. The bytecode itself is working as expected.
  it('Add should revert with mismatched tags', async () => {
    const aValue = 10;
    const bValue = 20;

    const aOffset = 0;
    const bOffset = 1;
    const resultOffset = 2;
    const returnSizeOffset = 3;

    const bytecode = encodeToBytecode([
      // Set value of a as FIELD
      new Set(/*indirect=*/ 0, /*dstOffset=*/ aOffset, TypeTag.FIELD, /*value=*/ aValue).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // Set value of b as UINT32 (mismatched tag!)
      new Set(/*indirect=*/ 0, /*dstOffset=*/ bOffset, TypeTag.UINT32, /*value=*/ bValue).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // Try to add a + b (should fail due to tag mismatch)
      new Add(/*indirect=*/ 0, /*aOffset=*/ aOffset, /*bOffset=*/ bOffset, /*dstOffset=*/ resultOffset).as(
        Opcode.ADD_8,
        Add.wireFormat8,
      ),
      // Set return size to 1 to return sum
      // SHOULD NOT REACH HERE!
      new Set(/*indirect=*/ 0, /*dstOffset=*/ returnSizeOffset, TypeTag.UINT32, /*value=*/ 1).as(
        Opcode.SET_8,
        Set.wireFormat8,
      ),
      // Return successfully (with one field element: the sum)
      new Return(/*indirect=*/ 0, /*returnSizeOffset=*/ returnSizeOffset, /*returnOffset=*/ resultOffset).as(
        Opcode.RETURN,
        Return.wireFormat,
      ),
    ]);

    const result = await testCustomBytecode(bytecode, tester, 'AddTagMismatchTest');
    expect(result.revertCode.isOK()).toBe(false);
  });
});
