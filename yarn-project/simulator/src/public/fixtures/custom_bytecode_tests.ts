import { Addressing, AddressingMode } from '../avm/opcodes/addressing_mode.js';
import { CalldataCopy, Return } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import { testCustomBytecode } from './custom_bytecode_tester.js';
import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

// First instruction resolved a base address (offset 0) which is uninitialized and therefore
// of invalid tag (FF). This will trigger an exceptional halt.
export async function addressingWithBaseTagIssueTest(isIndirect: boolean, tester: PublicTxSimulationTester) {
  const addressingMode = Addressing.fromModes([
    isIndirect ? AddressingMode.INDIRECT_RELATIVE : AddressingMode.RELATIVE,
    AddressingMode.DIRECT,
    AddressingMode.DIRECT,
  ]);

  const bytecode = encodeToBytecode([
    new CalldataCopy(/*indirect=*/ addressingMode.toWire(), /*copySize=*/ 1, /*cdOffset=*/ 0, /*dstOffset=*/ 0),
    new Return(/*indirect=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  const txLabel = isIndirect ? 'AddressingWithBaseTagInvalidIndirect' : 'AddressingWithBaseTagInvalidDirect';
  const result = await testCustomBytecode(bytecode, tester, txLabel);
  expect(result.revertCode.isOK()).toBe(false);
}
