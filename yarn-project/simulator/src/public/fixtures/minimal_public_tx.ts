import { FunctionType, emptyContractArtifact, emptyFunctionArtifact } from '@aztec/stdlib/abi';
import { AvmCircuitInputs } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import avmMinimalCircuitInputsJson from '../../../artifacts/avm_minimal_inputs.json' with { type: 'json' };
import { TypeTag } from '../avm/avm_memory_types.js';
import { Add, Return, SLoad, SStore, Set } from '../avm/opcodes/index.js';
import { encodeToBytecode } from '../avm/serialization/bytecode_serialization.js';
import { Opcode } from '../avm/serialization/instruction_serialization.js';
import type { PublicTxResult } from '../public_tx_simulator/public_tx_simulator.js';
import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

export async function createAvmMinimalPublicTx(): Promise<PublicTxResult> {
  const deployer = AztecAddress.fromNumber(42);

  const simTester = await PublicTxSimulationTester.create();

  const minimalBytecode = encodeToBytecode([
    new Set(/*indirect*/ 0, /*dstOffset*/ 0, TypeTag.UINT32, /*value*/ 1).as(Opcode.SET_8, Set.wireFormat8),
    new Set(/*indirect*/ 0, /*dstOffset*/ 1, TypeTag.UINT32, /*value*/ 2).as(Opcode.SET_8, Set.wireFormat8),
    new Add(/*indirect=*/ 0, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2).as(Opcode.ADD_8, Add.wireFormat8),
    new Set(/*indirect*/ 0, /*dstOffset*/ 3, TypeTag.FIELD, /*value*/ 27n).as(Opcode.SET_FF, Set.wireFormatFF),
    new Set(/*indirect*/ 0, /*dstOffset*/ 4, TypeTag.FIELD, /*value*/ 42n).as(Opcode.SET_FF, Set.wireFormatFF),
    new SStore(/*indirect*/ 0, /*value*/ 4, /*slot*/ 3).as(Opcode.SSTORE, SStore.wireFormat),
    new SLoad(/*indirect*/ 0, /*slot*/ 3, /*dstOffset*/ 5).as(Opcode.SLOAD, SLoad.wireFormat),
    new Return(/*indirect=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 2),
  ]);

  const minimalContractArtifact = emptyContractArtifact();
  minimalContractArtifact.name = 'MinimalContract';
  minimalContractArtifact.functions = [emptyFunctionArtifact()];
  minimalContractArtifact.functions[0].name = 'public_dispatch';
  minimalContractArtifact.functions[0].functionType = FunctionType.PUBLIC;
  minimalContractArtifact.functions[0].bytecode = minimalBytecode;

  const minimalTestContract = await simTester.registerAndDeployContract(
    /*constructorArgs=*/ [],
    deployer,
    /*contractArtifact=*/ minimalContractArtifact,
  );

  return await simTester.simulateTx(
    /*sender=*/ deployer,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: minimalTestContract.address,
        fnName: 'public_dispatch',
        args: [],
      },
    ],
    /*teardownCall=*/ undefined,
    /*feePayer=*/ deployer,
  );
}

/**
 * Reads the AVM circuit inputs for the minimal public tx from a pre-generated JSON file.
 * @returns The AvmCircuitInputs for the minimal public tx.
 */
export function readAvmMinimalPublicTxInputsFromFile(): AvmCircuitInputs {
  return AvmCircuitInputs.schema.parse(avmMinimalCircuitInputsJson);
}
