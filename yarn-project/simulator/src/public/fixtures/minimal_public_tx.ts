import { AvmCircuitInputs } from '@aztec/stdlib/avm';
import { ProtocolContracts } from '@aztec/stdlib/tx';

import avmMinimalCircuitInputsJson from '../../../artifacts/avm_minimal_inputs.json' with { type: 'json' };
import { TypeTag } from '../avm/avm_memory_types.js';
import { Add, Return, Set } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../avm/serialization/instruction_serialization.js';
import type { PublicTxResult } from '../public_tx_simulator/public_tx_simulator.js';
import { testCustomBytecode } from './custom_bytecode_tester.js';
import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

export async function simAvmMinimalPublicTx(): Promise<PublicTxResult> {
  const minimalBytecode = encodeToBytecode([
    new Set(/*indirect*/ 0, /*dstOffset*/ 0, TypeTag.UINT32, /*value*/ 1).as(Opcode.SET_8, Set.wireFormat8),
    new Set(/*indirect*/ 0, /*dstOffset*/ 1, TypeTag.UINT32, /*value*/ 2).as(Opcode.SET_8, Set.wireFormat8),
    new Add(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).as(Opcode.ADD_8, Add.wireFormat8),
    new Return(/*indirect=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 2),
  ]);

  const tester = await PublicTxSimulationTester.create();

  const result = await testCustomBytecode(minimalBytecode, tester, 'MinimalTx', 'AvmMinimalContract');

  // Modify the protocol contracts to be all zeros
  result.avmProvingRequest.inputs.hints.protocolContracts = ProtocolContracts.empty();
  result.avmProvingRequest.inputs.publicInputs.protocolContracts = ProtocolContracts.empty();

  return result;
}

/**
 * Reads the AVM circuit inputs for the minimal public tx from a pre-generated JSON file.
 * @returns The AvmCircuitInputs for the minimal public tx.
 */
export function readAvmMinimalPublicTxInputsFromFile(): AvmCircuitInputs {
  return AvmCircuitInputs.schema.parse(avmMinimalCircuitInputsJson);
}
