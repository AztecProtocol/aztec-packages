import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { AvmGadgetsTestContractArtifact } from '@aztec/noir-contracts.js/AvmGadgetsTest';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { Metrics } from '@aztec/telemetry-client';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { benchmarkSetup } from '../../../test/bench.js';
import { PublicTxSimulationTester, defaultGlobals } from '../../fixtures/public_tx_simulation_tester.js';
import { ammTest } from './amm_test.js';
import { tokenTest } from './token_test.js';

describe('Public TX simulator apps tests: benchmarks', () => {
  const logger = createLogger('public-tx-apps-tests-bench');

  let telemetryClient: TelemetryClient;
  let teardown: () => Promise<void>;

  beforeAll(() => {
    ({ telemetryClient, teardown } = benchmarkSetup(
      ///*telemetryConfig=*/ {},
      /*metrics=*/ [
        Metrics.PUBLIC_EXECUTOR_SIMULATION_TOTAL_INSTRUCTIONS,
        Metrics.PUBLIC_EXECUTOR_SIMULATION_MANA_USED,
        Metrics.PUBLIC_EXECUTOR_SIMULATION_MANA_PER_SECOND,
        Metrics.PUBLIC_EXECUTOR_SIMULATION_DURATION,
      ],
    ));
  });

  afterAll(async () => {
    await teardown();
  });

  it('TokenContract', async () => {
    const tester = await PublicTxSimulationTester.create(defaultGlobals(), telemetryClient, 'Token');
    await tokenTest(tester, logger);
  });

  it('AMM Contract', async () => {
    const tester = await PublicTxSimulationTester.create(defaultGlobals(), telemetryClient, 'AMM');
    await ammTest(tester, logger);
  });

  it('AVM simulator bulk test', async () => {
    const deployer = AztecAddress.fromNumber(42);

    const tester = await PublicTxSimulationTester.create(defaultGlobals(), telemetryClient, 'AvmTest');
    const avmTestContract = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      deployer,
      /*contractArtifact=*/ AvmTestContractArtifact,
    );

    // Get a deployed contract instance to pass to the contract
    // for it to use as "expected" values when testing contract instance retrieval.
    const expectContractInstance = avmTestContract;
    const argsField = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const argsU8 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const args = [
      argsField,
      argsU8,
      /*getInstanceForAddress=*/ expectContractInstance.address,
      /*expectedDeployer=*/ expectContractInstance.deployer,
      /*expectedClassId=*/ expectContractInstance.currentContractClassId,
      /*expectedInitializationHash=*/ expectContractInstance.initializationHash,
    ];

    const bulkResult = await tester.simulateTx(
      /*sender=*/ deployer,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: avmTestContract.address,
          fnName: 'bulk_testing',
          args,
        },
      ],
    );
    expect(bulkResult.revertCode.isOK()).toBe(true);
  });

  describe('AVM gadgets', () => {
    const deployer = AztecAddress.fromNumber(42);

    let tester: PublicTxSimulationTester;
    let avmGadgetsTestContract: ContractInstanceWithAddress;

    beforeAll(async () => {
      tester = await PublicTxSimulationTester.create(defaultGlobals(), telemetryClient, 'AvmGadgetsTest');
      avmGadgetsTestContract = await tester.registerAndDeployContract(
        /*constructorArgs=*/ [],
        deployer,
        /*contractArtifact=*/ AvmGadgetsTestContractArtifact,
      );
    });

    describe.each(
      // sha sizes
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 255, 256, 511, 512, 2048],
    )('sha256_hash_%s', (length: number) => {
      it(`sha256_hash_${length}`, async () => {
        const result = await tester.simulateTx(
          /*sender=*/ deployer,
          /*setupCalls=*/ [],
          /*appCalls=*/ [
            {
              address: avmGadgetsTestContract.address,
              fnName: `sha256_hash_${length}`,
              args: [/*input=*/ Array.from({ length: length }, () => randomInt(2 ** 8))],
            },
          ],
        );
        expect(result.revertCode.isOK()).toBe(true);
      });
    });

    it('keccak_hash', async () => {
      const result = await tester.simulateTx(
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'keccak_hash',
            args: [/*input=*/ Array.from({ length: 10 }, () => randomInt(2 ** 8))],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('keccak_f1600', async () => {
      const result = await tester.simulateTx(
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'keccak_f1600',
            args: [/*input=*/ Array.from({ length: 25 }, () => randomInt(2 ** 32))],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('poseidon2_hash', async () => {
      const result = await tester.simulateTx(
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'poseidon2_hash',
            args: [/*input=*/ Array.from({ length: 10 }, () => Fr.random())],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('pedersen_hash', async () => {
      const result = await tester.simulateTx(
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'pedersen_hash',
            args: [/*input=*/ Array.from({ length: 10 }, () => Fr.random())],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('pedersen_hash_with_index', async () => {
      const result = await tester.simulateTx(
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'pedersen_hash_with_index',
            args: [/*input=*/ Array.from({ length: 10 }, () => Fr.random())],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });
  });
});
