import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { Metrics } from '@aztec/telemetry-client';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { benchmarkSetup } from '../../../test/bench.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';
import type { PublicTxResult } from '../public_tx_simulator.js';

describe('Public TX simulator apps tests: TokenContract', () => {
  const logger = createLogger('public-tx-apps-tests-token');
  const admin = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(111);
  const receiver = AztecAddress.fromNumber(222);

  let token: ContractInstanceWithAddress;
  let simTester: PublicTxSimulationTester;

  let telemetryClient: TelemetryClient;
  let teardown: () => Promise<void>;

  beforeAll(() => {
    ({ telemetryClient, teardown } = benchmarkSetup(
      ///*telemetryConfig=*/ {},
      /*metrics=*/ [
        Metrics.PUBLIC_EXECUTOR_SIMULATION_COUNT,
        //Metrics.PUBLIC_EXECUTOR_SIMULATION_MANA_USED,
        {
          name: 'aztec.public_tx_simulator.simulation_total_instructions',
          source: Metrics.PUBLIC_EXECUTOR_SIMULATION_TOTAL_INSTRUCTIONS,
          unit: 'instructions',
          transform: (value: number) => value,
        },
        {
          // Invert mana-per-second since benchmark action requires that all metrics
          // conform to either "bigger-is-better" or "smaller-is-better".
          name: 'aztec.public_tx_simulator.simulation_mana_per_second',
          source: Metrics.PUBLIC_EXECUTOR_SIMULATION_MANA_PER_SECOND,
          unit: 'us/mana',
          transform: (value: number) => 1e6 / value,
        },
      ],
    ));
  });

  beforeEach(async () => {
    simTester = await PublicTxSimulationTester.create(telemetryClient);
    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
    token = await simTester.registerAndDeployContract(constructorArgs, /*deployer=*/ admin, TokenContractArtifact);

    const constructorResult = await simTester.simulateTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'constructor',
          args: constructorArgs,
        },
      ],
      /*teardownCall=*/ undefined, // use default
      /*feePayer=*/ undefined, // use default
      /*firstNullifier=*/ undefined, // use default
      /*globals=*/ undefined, // use default
      /*metricsTag=*/ 'TokenContract.constructor',
    );
    expect(constructorResult.revertCode.isOK()).toBe(true);
  });

  afterAll(async () => {
    await teardown();
  });

  it('token mint, transfer, burn (and check balances)', async () => {
    const startTime = performance.now();

    const mintAmount = 100n;
    const transferAmount = 50n;
    const nonce = new Fr(0);

    await checkBalance(sender, 0n);

    const mintResult = await simTester.simulateTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'mint_to_public',
          args: [/*to=*/ sender, mintAmount],
        },
      ],
      /*teardownCall=*/ undefined, // use default
      /*feePayer=*/ undefined, // use default
      /*firstNullifier=*/ undefined, // use default
      /*globals=*/ undefined, // use default
      /*metricsTag=*/ 'TokenContract.mint',
    );
    expect(mintResult.revertCode.isOK()).toBe(true);
    await checkBalance(sender, mintAmount);

    const transferResult = await simTester.simulateTx(
      /*sender=*/ sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'transfer_in_public',
          args: [/*from=*/ sender, /*to=*/ receiver, transferAmount, nonce],
        },
      ],
      /*teardownCall=*/ undefined, // use default
      /*feePayer=*/ undefined, // use default
      /*firstNullifier=*/ undefined, // use default
      /*globals=*/ undefined, // use default
      /*metricsTag=*/ 'TokenContract.transfer_in_public',
    );
    expect(transferResult.revertCode.isOK()).toBe(true);
    await checkBalance(sender, mintAmount - transferAmount);
    await checkBalance(receiver, transferAmount);

    const burnResult = await simTester.simulateTx(
      /*sender=*/ receiver,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'burn_public',
          args: [/*from=*/ receiver, transferAmount, nonce],
        },
      ],
      /*teardownCall=*/ undefined, // use default
      /*feePayer=*/ undefined, // use default
      /*firstNullifier=*/ undefined, // use default
      /*globals=*/ undefined, // use default
      /*metricsTag=*/ 'TokenContract.burn',
    );
    expect(burnResult.revertCode.isOK()).toBe(true);
    await checkBalance(receiver, 0n);

    const endTime = performance.now();
    logger.verbose(`TokenContract public tx simulator test took ${endTime - startTime}ms\n`);
  });

  const checkBalance = async (account: AztecAddress, expectedBalance: bigint) => {
    const balResult = await simTester.simulateTx(
      sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'balance_of_public',
          args: [/*owner=*/ account],
          isStaticCall: true,
        },
      ],
      /*teardownCall=*/ undefined, // use default
      /*feePayer=*/ undefined, // use default
      /*firstNullifier=*/ undefined, // use default
      /*globals=*/ undefined, // use default
      /*metricsTag=*/ 'TokenContract.balance_of_public',
    );
    expect(balResult.revertCode.isOK()).toBe(true);
    expectAppCall0Output(balResult, [new Fr(expectedBalance)]);
  };
});

function expectAppCall0Output(txResult: PublicTxResult, expectedOutput: Fr[]): void {
  expect(txResult.processedPhases).toEqual([
    expect.objectContaining({ returnValues: [expect.objectContaining({ values: expectedOutput })] }),
  ]);
}
