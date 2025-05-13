import { type ContractArtifact, FunctionType } from '@aztec/stdlib/abi';
import { AvmCircuitInputs } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { strict as assert } from 'assert';

import avmMinimalCircuitInputsJson from '../../../artifacts/avm_minimal_inputs.json' assert { type: 'json' };
import { TypeTag } from '../avm/avm_memory_types.js';
import { Add, Return, Set } from '../avm/opcodes/index.js';
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
    new Return(/*indirect=*/ 0, /*copySizeOffset=*/ 0, /*returnOffset=*/ 2),
  ]);

  const minimalContractArtifact: ContractArtifact = {
    name: 'MinimalContract',
    functions: [
      {
        name: 'public_dispatch',
        isInitializer: false,
        isStatic: false,
        functionType: FunctionType.PUBLIC,
        isInternal: false,
        parameters: [],
        returnTypes: [],
        errorTypes: {},
        bytecode: minimalBytecode,
        debugSymbols: '',
      },
    ],
    nonDispatchPublicFunctions: [],
    outputs: {
      structs: {},
      globals: {},
    },
    fileMap: {},
    storageLayout: {},
    notes: {},
  };

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
  );
}

/**
 * Reads the AVM circuit inputs for the minimal public tx from a pre-generated JSON file.
 * @returns The AvmCircuitInputs for the minimal public tx.
 */
export function readAvmMinimalPublicTxInputsFromFile(): AvmCircuitInputs {
  return AvmCircuitInputs.schema.parse(avmMinimalCircuitInputsJson);
}
