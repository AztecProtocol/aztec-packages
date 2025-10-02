import { Fr } from '@aztec/foundation/fields';
import { FunctionType, emptyContractArtifact, emptyFunctionArtifact } from '@aztec/stdlib/abi';
import { AvmProtocolContractAddressHint } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { PublicTxResult } from '../public_tx_simulator/public_tx_simulator.js';
import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

/**
 * Creates a custom bytecode simulation with the provided bytecode and optional contract name.
 * @param bytecode - The bytecode buffer to use
 * @param contractName - The name of the contract (optional, defaults to "NoContractName")
 * @returns Promise<PublicTxResult> - The simulation result
 */
export async function customBytecodeSimulate(
  bytecode: Buffer,
  contractName: string = 'NoContractName',
): Promise<PublicTxResult> {
  const deployer = AztecAddress.fromNumber(42);

  const simTester = await PublicTxSimulationTester.create();

  const contractArtifact = emptyContractArtifact();
  contractArtifact.name = contractName;
  contractArtifact.functions = [emptyFunctionArtifact()];
  contractArtifact.functions[0].name = 'public_dispatch';
  contractArtifact.functions[0].functionType = FunctionType.PUBLIC;
  contractArtifact.functions[0].bytecode = bytecode;

  const testContract = await simTester.registerAndDeployContract(
    /*constructorArgs=*/ [],
    deployer,
    /*contractArtifact=*/ contractArtifact,
  );

  const result = await simTester.simulateTx(
    /*sender=*/ deployer,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: testContract.address,
        fnName: 'public_dispatch',
        args: [],
      },
    ],
    /*teardownCall=*/ undefined,
    /*feePayer=*/ deployer,
  );

  // Modify the protocolContractDerivedAddresses to be all zeros and modify the protocolContractTreeRoot
  // to be a fixed value (the root of a tree of all 0 leaves). This ensures that the testdata is stable
  result.avmProvingRequest.inputs.hints.protocolContractDerivedAddresses =
    result.avmProvingRequest.inputs.hints.protocolContractDerivedAddresses.map(
      () => new AvmProtocolContractAddressHint(AztecAddress.ZERO, AztecAddress.ZERO),
    );
  result.avmProvingRequest.inputs.publicInputs.protocolContractTreeRoot = Fr.fromString(
    '0x0dcca15f6b97b59e13712bd9e5a6a2e7fe2349ebb82b5a82a4ae554358bac73a',
  );

  // You can uncomment this to log the actual root if you want to verify it it matches
  // const protocolContractTree = await buildProtocolContractTree([]);
  // console.log(Fr.fromBuffer(protocolContractTree.root));

  return result;
}
