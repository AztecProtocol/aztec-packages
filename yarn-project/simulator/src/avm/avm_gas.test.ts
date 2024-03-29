import { TypeTag } from './avm_memory_types.js';
import { AvmSimulator } from './avm_simulator.js';
import { initContext } from './fixtures/index.js';
import { Add, CalldataCopy, Div, Mul, Set as SetInstruction, Sub } from './opcodes/index.js';
import { encodeToBytecode } from './serialization/bytecode_serialization.js';

describe('AVM simulator: dynamic gas costs per instruction', () => {
  it.each([
    [new SetInstruction(/*indirect=*/ 0, /*inTag=*/ TypeTag.UINT8, /*value=*/ 1, /*dstOffset=*/ 0), [110, 0, 0]],
    [new SetInstruction(/*indirect=*/ 0, /*inTag=*/ TypeTag.UINT32, /*value=*/ 1, /*dstOffset=*/ 0), [110]],
    [new CalldataCopy(/*indirect=*/ 0, /*cdOffset=*/ TypeTag.UINT8, /*copySize=*/ 1, /*dstOffset=*/ 0), [110]],
    [new CalldataCopy(/*indirect=*/ 0, /*cdOffset=*/ TypeTag.UINT8, /*copySize=*/ 5, /*dstOffset=*/ 0), [550]],
    [new Add(/*indirect=*/ 0, /*inTag=*/ TypeTag.UINT8, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3), [130]],
    [new Add(/*indirect=*/ 0, /*inTag=*/ TypeTag.UINT32, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3), [160]],
    [new Add(/*indirect=*/ 3, /*inTag=*/ TypeTag.UINT8, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3), [150]],
    [new Sub(/*indirect=*/ 3, /*inTag=*/ TypeTag.UINT8, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3), [150]],
    [new Mul(/*indirect=*/ 3, /*inTag=*/ TypeTag.UINT8, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3), [150]],
    [new Div(/*indirect=*/ 3, /*inTag=*/ TypeTag.UINT8, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3), [150]],
  ] as const)('computes gas cost for %s', async (instruction, [l2GasCost, l1GasCost, daGasCost]) => {
    const bytecode = encodeToBytecode([instruction]);
    const context = initContext();
    const {
      l2GasLeft: initialL2GasLeft,
      daGasLeft: initialDaGasLeft,
      l1GasLeft: initialL1GasLeft,
    } = context.machineState;

    await new AvmSimulator(context).executeBytecode(bytecode);

    expect(initialL2GasLeft - context.machineState.l2GasLeft).toEqual(l2GasCost ?? 0);
    expect(initialL1GasLeft - context.machineState.l1GasLeft).toEqual(l1GasCost ?? 0);
    expect(initialDaGasLeft - context.machineState.daGasLeft).toEqual(daGasCost ?? 0);
  });
});
