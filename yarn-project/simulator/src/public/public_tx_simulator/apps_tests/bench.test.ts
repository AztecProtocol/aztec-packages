import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { AvmGadgetsTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmGadgetsTest';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { PublicTxSimulationTester, defaultGlobals } from '../../fixtures/public_tx_simulation_tester.js';
import { TestExecutorMetrics } from '../../test_executor_metrics.js';
import { ammTest } from './amm_test.js';
import { tokenTest } from './token_test.js';

describe('Public TX simulator apps tests: benchmarks', () => {
  const logger = createLogger('public-tx-apps-tests-bench');

  const metrics = new TestExecutorMetrics();
  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    tester = await PublicTxSimulationTester.create(defaultGlobals(), metrics);
  });

  afterAll(() => {
    if (process.env.BENCH_OUTPUT) {
      mkdirSync(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      writeFileSync(process.env.BENCH_OUTPUT, metrics.toGithubActionBenchmarkJSON());
    } else if (process.env.BENCH_OUTPUT_MD) {
      writeFileSync(process.env.BENCH_OUTPUT_MD, metrics.toPrettyString());
    } else {
      logger.info(`\n`); // sometimes jest tests obscure the last line(s)
      logger.info(metrics.toPrettyString());
    }
  });

  it('Token Contract test', async () => {
    tester.setMetricsPrefix('Token contract tests');
    await tokenTest(tester, logger);
  });

  it('AMM Contract test', async () => {
    tester.setMetricsPrefix('AMM contract tests');
    await ammTest(tester, logger);
  });

  it('AVM simulator bulk test', async () => {
    tester.setMetricsPrefix('AvmTest contract tests');
    const deployer = AztecAddress.fromNumber(42);

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

    const bulkResult = await tester.simulateTxWithLabel(
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
    );
    expect(bulkResult.revertCode.isOK()).toBe(true);
  });

  it('AVM large calldata test', async () => {
    tester.setMetricsPrefix('AvmTest contract tests');
    const deployer = AztecAddress.fromNumber(42);

    const avmTestContract = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      deployer,
      /*contractArtifact=*/ AvmTestContractArtifact,
    );

    const result = await tester.simulateTxWithLabel(
      /*txLabel=*/ 'AvmTest/nested_call_large_calldata',
      /*sender=*/ deployer,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: avmTestContract.address,
          fnName: 'nested_call_large_calldata',
          args: [/*input=*/ Array.from({ length: 300 }, () => Fr.random())],
        },
      ],
    );
    expect(result.revertCode.isOK()).toBe(true);
  });

  describe('AVM gadgets tests', () => {
    const deployer = AztecAddress.fromNumber(42);

    let tester: PublicTxSimulationTester;
    let avmGadgetsTestContract: ContractInstanceWithAddress;

    beforeAll(async () => {
      tester = await PublicTxSimulationTester.create(defaultGlobals(), metrics);
      avmGadgetsTestContract = await tester.registerAndDeployContract(
        /*constructorArgs=*/ [],
        deployer,
        /*contractArtifact=*/ AvmGadgetsTestContractArtifact,
      );
      tester.setMetricsPrefix(`AvmGadgetsTest contract tests`);
    });

    describe.each(
      // sha sizes
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 255, 256, 511, 512, 2048],
    )('sha256_hash_%s', (length: number) => {
      it(`sha256_hash_${length}`, async () => {
        const result = await tester.simulateTxWithLabel(
          /*txLabel=*/ `AvmGadgetsTest/sha256_hash_${length}`,
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
      const result = await tester.simulateTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/keccak_hash',
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
      const result = await tester.simulateTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/keccak_f1600',
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
      const result = await tester.simulateTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/poseidon2_hash',
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
      const result = await tester.simulateTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/pedersen_hash',
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
      const result = await tester.simulateTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/pedersen_hash_with_index',
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
