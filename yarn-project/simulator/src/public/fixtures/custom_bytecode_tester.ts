import { FunctionType, emptyContractArtifact, emptyFunctionArtifact } from '@aztec/stdlib/abi';
import type { PublicTxResult } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

/**
 * Deploy a contract with the provided bytecode.
 * @param bytecode - The bytecode buffer to use
 * @param tester - The tester to use
 * @param contractName - The name of the contract
 * @param deployer - The deployer address
 * @returns The deployed contract instance
 */
export async function deployCustomBytecode(
  bytecode: Buffer,
  tester: PublicTxSimulationTester,
  contractName: string = 'CustomBytecodeContract',
  deployer: AztecAddress = AztecAddress.fromNumber(42),
): Promise<ContractInstanceWithAddress> {
  const contractArtifact = emptyContractArtifact();
  contractArtifact.name = contractName;
  contractArtifact.functions = [emptyFunctionArtifact()];
  // We use name 'public_dispatch' since that is what is expected
  // in a ContractArtifact. But function selectors are not required
  // when executing since the custom bytecode likely has no dispatch.
  contractArtifact.functions[0].name = 'public_dispatch';
  contractArtifact.functions[0].functionType = FunctionType.PUBLIC;
  contractArtifact.functions[0].bytecode = bytecode;

  // return the contract instance
  return await tester.registerAndDeployContract(
    /*constructorArgs=*/ [],
    deployer,
    /*contractArtifact=*/ contractArtifact,
  );
}

/**
 * Execute a custom bytecode contract.
 * @param contract - The contract instance to execute
 * @param tester - The tester to use
 * @param txLabel - The label of the transaction
 * @param calldata - The calldata to use
 * @returns The execution result
 */
export async function executeCustomBytecode(
  contract: ContractInstanceWithAddress,
  tester: PublicTxSimulationTester,
  txLabel: string = 'CustomBytecodeTest',
  calldata: any[] = [],
): Promise<PublicTxResult> {
  // EXECUTE! This means that if using AvmProvingTester subclass, it will PROVE the transaction!
  return await tester.executeTxWithLabel(
    /*txLabel=*/ txLabel,
    /*sender=*/ contract.deployer,
    /*setupCalls=*/ [],
    /*appCalls=*/ [{ address: contract.address, args: calldata }],
  );
}

/**
 * Deploy and execute a custom bytecode contract.
 * @param bytecode - The bytecode buffer to use
 * @param tester - The tester to use
 * @param txLabel - The label of the transaction
 * @param contractName - The name of the contract
 * @param deployer - The deployer address
 * @param calldata - The calldata to use
 * @returns The execution result
 */
export async function deployAndExecuteCustomBytecode(
  bytecode: Buffer,
  tester: PublicTxSimulationTester,
  txLabel: string = 'CustomBytecodeTest',
  contractName: string = 'CustomBytecodeContract',
  deployer: AztecAddress = AztecAddress.fromNumber(42),
  calldata: any[] = [],
): Promise<PublicTxResult> {
  const testContract = await deployCustomBytecode(bytecode, tester, contractName, deployer);
  return await executeCustomBytecode(testContract, tester, txLabel, calldata);
}
