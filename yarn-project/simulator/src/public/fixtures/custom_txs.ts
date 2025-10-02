import { Addressing, AddressingMode } from '../avm/opcodes/addressing_mode.js';
import { CalldataCopy, Return } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import type { PublicTxResult } from '../public_tx_simulator/public_tx_simulator.js';
import { customBytecodeSimulate } from './custom_bytecode.js';

// First instruction resolved a base address (offset 0) which is uninitialized and therefore
// of invalid tag (FF). This will trigger an exceptional halt.
export async function getAddressingWithBaseTagIssueTx(isIndirect: boolean): Promise<PublicTxResult> {
  const addressingMode = Addressing.fromModes([
    isIndirect ? AddressingMode.INDIRECT_RELATIVE : AddressingMode.RELATIVE,
    AddressingMode.DIRECT,
    AddressingMode.DIRECT,
  ]);

  const minimalBytecode = encodeToBytecode([
    new CalldataCopy(/*indirect=*/ addressingMode.toWire(), /*copySize=*/ 1, /*cdOffset=*/ 0, /*dstOffset=*/ 0),
    new Return(/*indirect=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 0),
  ]);

  return await customBytecodeSimulate(minimalBytecode, 'AddressingWithBaseTagIssue');
}
