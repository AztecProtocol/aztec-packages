import type { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionType, emptyContractArtifact, emptyFunctionArtifact } from '@aztec/stdlib/abi';
import type { PublicTxResult } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

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
  calldata: any[] = [],
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
        args: calldata,
      },
    ],
  );
}

/**
 * Test nested custom bytecode for side-effect limited opcodes.
 *
 * Deploys an inner contract that does side effects + reverts, then deploys
 * an outer contract that loops calling the inner until out-of-gas.
 *
 * @param innerBytecode - Bytecode for inner contract (side effects + revert)
 * @param createOuterBytecode - Function to create outer bytecode given inner address
 * @param tester - The tester to use
 * @param txLabel - The label of the transaction
 */
export async function testNestedCustomBytecode(
  innerBytecode: Buffer,
  createOuterBytecode: (innerAddress: Fr) => Buffer,
  tester: PublicTxSimulationTester,
  txLabel: string,
): Promise<PublicTxResult> {
  const deployer = AztecAddress.fromNumber(42);

  // Deploy inner contract (side effects + revert)
  const innerArtifact = emptyContractArtifact();
  innerArtifact.name = `${txLabel}_Inner`;
  innerArtifact.functions = [emptyFunctionArtifact()];
  innerArtifact.functions[0].name = 'public_dispatch';
  innerArtifact.functions[0].functionType = FunctionType.PUBLIC;
  innerArtifact.functions[0].bytecode = innerBytecode;

  const innerContract = await tester.registerAndDeployContract(
    /*constructorArgs=*/ [],
    deployer,
    /*contractArtifact=*/ innerArtifact,
  );

  // Create outer bytecode using inner contract address
  const outerBytecode = createOuterBytecode(innerContract.address.toField());

  // Deploy outer contract (loops calling inner)
  const outerArtifact = emptyContractArtifact();
  outerArtifact.name = `${txLabel}_Outer`;
  outerArtifact.functions = [emptyFunctionArtifact()];
  outerArtifact.functions[0].name = 'public_dispatch';
  outerArtifact.functions[0].functionType = FunctionType.PUBLIC;
  outerArtifact.functions[0].bytecode = outerBytecode;

  const outerContract = await tester.registerAndDeployContract(
    /*constructorArgs=*/ [],
    deployer,
    /*contractArtifact=*/ outerArtifact,
  );

  // Execute outer contract
  return await tester.executeTxWithLabel(
    /*txLabel=*/ txLabel,
    /*sender=*/ deployer,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: outerContract.address,
        fnName: 'public_dispatch',
        args: [],
      },
    ],
  );
}
