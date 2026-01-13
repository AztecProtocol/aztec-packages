import type { PublicTxResult } from '@aztec/stdlib/avm';
import { ProtocolContracts } from '@aztec/stdlib/tx';

import { TypeTag } from '../avm/avm_memory_types.js';
import { Add, Return, Set } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../avm/serialization/instruction_serialization.js';
import { deployAndExecuteCustomBytecode } from './custom_bytecode_tester.js';
import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

export async function executeAvmMinimalPublicTx(tester: PublicTxSimulationTester): Promise<PublicTxResult> {
  const minimalBytecode = encodeToBytecode([
    new Set(/*indirect*/ 0, /*dstOffset*/ 0, TypeTag.UINT32, /*value*/ 1).as(Opcode.SET_8, Set.wireFormat8),
    new Set(/*indirect*/ 0, /*dstOffset*/ 1, TypeTag.UINT32, /*value*/ 2).as(Opcode.SET_8, Set.wireFormat8),
    new Add(/*addressing_mode=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).as(Opcode.ADD_8, Add.wireFormat8),
    new Return(/*addressing_mode=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 2),
  ]);

  const result = await deployAndExecuteCustomBytecode(minimalBytecode, tester, 'MinimalTx', 'AvmMinimalContract');

  // Modify the protocol contracts to be all zeros
  result.hints!.protocolContracts = ProtocolContracts.empty();
  result.publicInputs!.protocolContracts = ProtocolContracts.empty();

  return result;
}
