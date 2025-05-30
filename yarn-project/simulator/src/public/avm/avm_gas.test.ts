import { AVM_MAX_OPERANDS } from '@aztec/constants';

import { computeAddressingCost, getBaseGasCost, getDynamicGasCost, sumGas } from './avm_gas.js';
import { TypeTag } from './avm_memory_types.js';
import { AvmSimulator } from './avm_simulator.js';
import { initContext } from './fixtures/index.js';
import { Add, CalldataCopy, Div, Mul, Set as SetInstruction, Sub } from './opcodes/index.js';
import { encodeToBytecode } from './serialization/bytecode_serialization.js';
import { MAX_OPCODE_VALUE } from './serialization/instruction_serialization.js';

describe.skip('AVM simulator: dynamic gas costs per instruction', () => {
  it.each([
    // BASE_GAS(10) * 1 + MEMORY_WRITE(100) = 110
    [new SetInstruction(/*indirect=*/ 0, /*dstOffset=*/ 0, /*inTag=*/ TypeTag.UINT8, /*value=*/ 1), [110, 0]],
    // BASE_GAS(10) * 1 + MEMORY_WRITE(100) = 110
    [new SetInstruction(/*indirect=*/ 0, /*dstOffset=*/ 0, /*inTag=*/ TypeTag.UINT32, /*value=*/ 1), [110]],
    // BASE_GAS(10) * 1 + MEMORY_WRITE(100) = 110
    [new CalldataCopy(/*indirect=*/ 0, /*copySize=*/ 1, /*cdOffset=*/ TypeTag.UINT8, /*dstOffset=*/ 0), [110]],
    // BASE_GAS(10) * 5 + MEMORY_WRITE(100) * 5 = 550
    [new CalldataCopy(/*indirect=*/ 0, /*copySize=*/ 5, /*cdOffset=*/ TypeTag.UINT8, /*dstOffset=*/ 0), [510]],
    // BASE_GAS(10) * 1 + MEMORY_READ(10) * 2 + MEMORY_WRITE(100) = 130
    [new Add(/*indirect=*/ 0, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3), [130]],
    // BASE_GAS(10) * 4 + MEMORY_READ(10) * 2 + MEMORY_WRITE(100) = 160
    [new Add(/*indirect=*/ 0, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3), [160]],
    // BASE_GAS(10) * 1 + MEMORY_READ(10) * 2 + MEMORY_INDIRECT_READ_PENALTY(10) * 2 + MEMORY_WRITE(100) = 150
    [new Add(/*indirect=*/ 3, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3), [150]],
    [new Sub(/*indirect=*/ 3, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3), [150]],
    [new Mul(/*indirect=*/ 3, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3), [150]],
    [new Div(/*indirect=*/ 3, /*aOffset=*/ 1, /*bOffset=*/ 2, /*dstOffset=*/ 3), [150]],
  ] as const)('computes gas cost for %s', async (instruction, [l2GasCost, daGasCost]) => {
    const bytecode = encodeToBytecode([instruction]);
    const context = initContext();
    const { l2GasLeft: initialL2GasLeft, daGasLeft: initialDaGasLeft } = context.machineState;

    await new AvmSimulator(context).executeBytecode(bytecode);

    expect(initialL2GasLeft - context.machineState.l2GasLeft).toEqual(l2GasCost ?? 0);
    expect(initialDaGasLeft - context.machineState.daGasLeft).toEqual(daGasCost ?? 0);
  });
});

// See gas.pil for the reasoning behind these limits.
describe('Gas values limits', () => {
  const MAX_U32 = 2 ** 32 - 1;
  it('Base gas should not be higher than u32::MAX_VALUE', () => {
    const maxAddressingCost = computeAddressingCost(AVM_MAX_OPERANDS, AVM_MAX_OPERANDS);
    for (let opcode = 0; opcode <= MAX_OPCODE_VALUE; opcode++) {
      const maxGas = sumGas(getBaseGasCost(opcode), maxAddressingCost);
      expect(maxGas.l2Gas).toBeLessThanOrEqual(MAX_U32);
      expect(maxGas.daGas).toBeLessThanOrEqual(MAX_U32);
    }
  });

  it('Dynamic gas should not be higher than u32::MAX_VALUE', () => {
    for (let opcode = 0; opcode <= MAX_OPCODE_VALUE; opcode++) {
      const maxGas = getDynamicGasCost(opcode);
      expect(maxGas.l2Gas).toBeLessThanOrEqual(MAX_U32);
      expect(maxGas.daGas).toBeLessThanOrEqual(MAX_U32);
    }
  });
});
