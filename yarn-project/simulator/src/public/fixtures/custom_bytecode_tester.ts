import { FunctionType, emptyContractArtifact, emptyFunctionArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { PublicTxResult } from '../public_tx_simulator/public_tx_simulator.js';
import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

/**
 *
 * Test custom bytecode (simulation or proving) with the provided bytecode.
 * @param bytecode - The bytecode buffer to use
 * @param tester - The tester to use (simulation or proving)
 * @param txLabel - The label of the transaction
 * @param contractName - The name of the contract (default: 'CustomBytecodeContract')
 */
export async function testCustomBytecode(
  bytecode: Buffer,
  tester: PublicTxSimulationTester,
  txLabel: string,
  contractName: string = 'CustomBytecodeContract',
): Promise<PublicTxResult> {
  const deployer = AztecAddress.fromNumber(42);

  const contractArtifact = emptyContractArtifact();
  contractArtifact.name = contractName;
  contractArtifact.functions = [emptyFunctionArtifact()];
  contractArtifact.functions[0].name = 'public_dispatch';
  contractArtifact.functions[0].functionType = FunctionType.PUBLIC;
  contractArtifact.functions[0].bytecode = bytecode;

  const testContract = await tester.registerAndDeployContract(
    /*constructorArgs=*/ [],
    deployer,
    /*contractArtifact=*/ contractArtifact,
  );

  // EXECUTE! This means that if using AvmProvingTester subclass, it will PROVE the transaction!
  return await tester.executeTxWithLabel(
    /*txLabel=*/ txLabel,
    /*sender=*/ deployer,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: testContract.address,
        fnName: 'public_dispatch',
        args: [],
      },
    ],
  );
}
