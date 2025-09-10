import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

export async function bulkTest(
  tester: PublicTxSimulationTester,
  logger: Logger,
  avmTestContractArtifact: ContractArtifact,
) {
  const timer = new Timer();

  const deployer = AztecAddress.fromNumber(42);
  const avmTestContract = await tester.registerAndDeployContract(
    /*constructorArgs=*/ [],
    deployer,
    avmTestContractArtifact,
  );

  // Needed since we invoke the Fee Juice Contract in the bulk test.registerFeeJuiceContract
  await tester.registerFeeJuiceContract();

  // Get a deployed contract instance to pass to the contract
  // for it to use as "expected" values when testing contract instance retrieval.
  const expectContractInstance = avmTestContract;
  const argsField = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsU8 = [1, 2, 3, 4, 5, 6, 7, 8].map(x => new Fr(x));
  argsU8.push(new Fr(2n ** 128n + 9n)); // Trigger truncation from large (> 128 bits) value (canonical decomposition event)
  argsU8.push(new Fr(2n ** 125n + 10n)); // Trigger truncation from small (< 128 bits) value (no canonical decomposition event)
  const args = [
    argsField,
    argsU8,
    /*getInstanceForAddress=*/ expectContractInstance.address,
    /*expectedDeployer=*/ expectContractInstance.deployer,
    /*expectedClassId=*/ expectContractInstance.currentContractClassId,
    /*expectedInitializationHash=*/ expectContractInstance.initializationHash,
    /*skip_strictly_limited_side_effects=*/ false,
  ];

  const bulkResult = await tester.executeTxWithLabel(
    /*txLabel=*/ 'AvmTest/bulk_testing',
    /*sender=*/ deployer,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: avmTestContract.address,
        fnName: 'bulk_testing',
        args,
      },
    ],
    /*teardownCall=*/ undefined,
    /*feePayer*/ undefined,
    /*privateInsertions=*/ {
      nonRevertible: {
        nullifiers: [new Fr(420000)],
        noteHashes: [new Fr(420001)],
      },
      revertible: {
        nullifiers: [new Fr(420002)],
        noteHashes: [new Fr(420003)],
      },
    },
  );

  logger.info(`Bulk test took ${timer.ms()}ms\n`);

  return bulkResult;
}

export async function megaBulkTest(
  tester: PublicTxSimulationTester,
  logger: Logger,
  avmTestContractArtifact: ContractArtifact,
) {
  const timer = new Timer();

  const deployer = AztecAddress.fromNumber(42);
  const avmTestContract = await tester.registerAndDeployContract(
    /*constructorArgs=*/ [],
    deployer,
    avmTestContractArtifact,
  );

  // Needed since we invoke the Fee Juice Contract in the bulk test.registerFeeJuiceContract
  await tester.registerFeeJuiceContract();

  // Get a deployed contract instance to pass to the contract
  // for it to use as "expected" values when testing contract instance retrieval.
  const expectContractInstance = avmTestContract;
  const argsField0 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField1 = [2, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField2 = [3, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField3 = [4, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField4 = [5, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField5 = [6, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField6 = [7, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField7 = [8, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField8 = [9, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField9 = [10, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField10 = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField11 = [12, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField12 = [13, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField13 = [14, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsField14 = [15, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const argsU8 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const genArgs = (argsField: Fr[]) => [
    argsField,
    argsU8,
    /*getInstanceForAddress=*/ expectContractInstance.address.toField(),
    /*expectedDeployer=*/ expectContractInstance.deployer.toField(),
    /*expectedClassId=*/ expectContractInstance.currentContractClassId.toField(),
    /*expectedInitializationHash=*/ expectContractInstance.initializationHash.toField(),
    // Must skip strictly limited side effects (logs, messages) so we can spam the bulk test several times.
    /*skip_strictly_limited_side_effects=*/ true,
  ];

  const bulkResult = await tester.executeTxWithLabel(
    /*txLabel=*/ 'AvmTest/mega_bulk_testing',
    /*sender=*/ deployer,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField0) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField1) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField2) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField3) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField4) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField5) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField6) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField7) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField8) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField9) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField10) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField11) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField12) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField13) },
      { address: avmTestContract.address, fnName: 'bulk_testing', args: genArgs(argsField14) },
    ],
    /*teardownCall=*/ undefined,
    /*feePayer*/ undefined,
    /*privateInsertions=*/ {
      nonRevertible: {
        nullifiers: [new Fr(420000)],
        noteHashes: [new Fr(420001)],
      },
      revertible: {
        nullifiers: [new Fr(420002)],
        noteHashes: [new Fr(420003)],
      },
    },
  );

  logger.info(`Mega bulk test took ${timer.ms()}ms\n`);

  return bulkResult;
}
