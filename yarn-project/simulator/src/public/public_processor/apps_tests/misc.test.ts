import { Fr } from '@aztec/foundation/fields';
import { TestDateProvider } from '@aztec/foundation/timer';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { computeEffectiveGasFees } from '@aztec/stdlib/fees';
import { GasFees, GasSettings } from '@aztec/stdlib/gas';
import { makeGlobalVariables } from '@aztec/stdlib/testing';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { NativeWorldStateService } from '@aztec/world-state';

import { PublicTxSimulationTester, SimpleContractDataSource } from '../../fixtures/index.js';
import { PublicContractsDB } from '../../public_db_sources.js';
import { PublicTxSimulator } from '../../public_tx_simulator/public_tx_simulator.js';
import { GuardedMerkleTreeOperations } from '../guarded_merkle_tree.js';
import { PublicProcessor } from '../public_processor.js';

describe('Public Processor app tests: misc tests', () => {
  const currentBlockGlobals = makeGlobalVariables(/*seed=*/ 1, { gasFees: new GasFees(1000, 2000) });
  const historicalGlobals = makeGlobalVariables(/*seed=*/ 2, { gasFees: new GasFees(1, 2) });

  // gas settings with max fees lower than the current block's gas fees
  const lowMaxFeesPerGas = new GasFees(1n, 1n);
  const txGasSettingsWithLowMax = GasSettings.default({ maxFeesPerGas: lowMaxFeesPerGas });

  // gas settings with max fees higher than the current block's gas fees
  const highMaxFeesPerGas = new GasFees(
    currentBlockGlobals.gasFees.feePerDaGas + 1000n,
    currentBlockGlobals.gasFees.feePerL2Gas + 1000n,
  );
  const txGasSettingsWithHighMax = GasSettings.default({ maxFeesPerGas: highMaxFeesPerGas });

  const admin = AztecAddress.fromNumber(42);

  let token: ContractInstanceWithAddress;
  let contractsDB: PublicContractsDB;
  let tester: PublicTxSimulationTester;
  let processor: PublicProcessor;

  beforeEach(async () => {
    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await (await NativeWorldStateService.tmp()).fork();
    const guardedMerkleTrees = new GuardedMerkleTreeOperations(merkleTrees);
    contractsDB = new PublicContractsDB(contractDataSource);
    const simulator = new PublicTxSimulator(
      guardedMerkleTrees,
      contractsDB,
      currentBlockGlobals,
      /*doMerkleOperations=*/ true,
    );

    processor = new PublicProcessor(
      currentBlockGlobals,
      guardedMerkleTrees,
      contractsDB,
      simulator,
      new TestDateProvider(),
      getTelemetryClient(),
    );

    tester = new PublicTxSimulationTester(merkleTrees, contractDataSource, currentBlockGlobals);

    // make sure tx senders have fee balance
    await tester.setFeePayerBalance(admin);
  });

  it('public simulation should use (and hint with) current gas fees, not historical gas fees', async () => {
    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];

    token = await tester.registerAndDeployContract(constructorArgs, /*deployer=*/ admin, TokenContractArtifact);
    const constructorTx = await tester.createTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'constructor',
          args: constructorArgs,
        },
      ],
      /*teardownCall=*/ undefined,
      /*feePayer=*/ undefined,
      /*privateInsertions=*/ undefined,
      /*historicalGlobals=*/ historicalGlobals,
    );

    // override the gas settings to make sure we have high enough max fees
    constructorTx.data.constants.txContext.gasSettings = txGasSettingsWithHighMax;

    const results = await processor.process([constructorTx]);
    const processedTxs = results[0];
    const failedTxs = results[1];
    expect(processedTxs.length).toBe(1); // just the constructor
    expect(failedTxs.length).toBe(0);

    expect(processedTxs[0].revertCode.isOK()).toBe(true);

    // the tx should use the current block's gas fees, not the historical gas
    const expectedEffectiveGasFees = computeEffectiveGasFees(
      currentBlockGlobals.gasFees,
      constructorTx.data.constants.txContext.gasSettings,
    );
    expect(processedTxs[0].avmProvingRequest?.inputs.hints.tx.effectiveGasFees).toEqual(expectedEffectiveGasFees);
  });

  it('public simulation should fail assert if the block gas fees are less than tx-specified max', async () => {
    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];

    token = await tester.registerAndDeployContract(constructorArgs, /*deployer=*/ admin, TokenContractArtifact);
    const constructorTx = await tester.createTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'constructor',
          args: constructorArgs,
        },
      ],
    );
    constructorTx.data.constants.txContext.gasSettings = txGasSettingsWithLowMax;

    const results = await processor.process([constructorTx]);
    const processedTxs = results[0];
    const failedTxs = results[1];
    expect(processedTxs.length).toBe(0);
    expect(failedTxs.length).toBe(1); // failure!
  });
});
