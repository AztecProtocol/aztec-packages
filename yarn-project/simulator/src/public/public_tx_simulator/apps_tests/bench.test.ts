import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { AvmGadgetsTestContractArtifact } from '@aztec/noir-contracts.js/AvmGadgetsTest';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { Metrics } from '@aztec/telemetry-client';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { benchmarkSetup } from '../../../test/bench.js';
import { randomMemoryBytes } from '../../avm/fixtures/index.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: benchmarks', () => {
  const logger = createLogger('public-tx-apps-tests-bench');

  let simTester: PublicTxSimulationTester;

  let telemetryClient: TelemetryClient;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ telemetryClient, teardown } = benchmarkSetup(
      ///*telemetryConfig=*/ {},
      /*metrics=*/ [
        Metrics.PUBLIC_EXECUTOR_SIMULATION_MANA_USED,
        Metrics.PUBLIC_EXECUTOR_SIMULATION_TOTAL_INSTRUCTIONS,
      ],
    ));
    simTester = await PublicTxSimulationTester.create(telemetryClient);
  });

  beforeEach(async () => {});

  afterAll(async () => {
    await teardown();
  });

  it('token constructor and transfer', async () => {
    const admin = AztecAddress.fromNumber(42);
    const sender = AztecAddress.fromNumber(111);
    const receiver = AztecAddress.fromNumber(222);

    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
    const token = await simTester.registerAndDeployContract(
      constructorArgs,
      /*deployer=*/ admin,
      TokenContractArtifact,
    );

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

    const startTime = performance.now();

    const mintAmount = 100n;
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

    const nonce = new Fr(0);
    const transferAmount = 50n;
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

    const endTime = performance.now();
    logger.verbose(`BENCH: TokenContract public tx simulator test took ${endTime - startTime}ms\n`);
  });

  it('AVM simulator bulk test', async () => {
    const deployer = AztecAddress.fromNumber(42);

    const avmTestContract = await simTester.registerAndDeployContract(
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

    const bulkResult = await simTester.simulateTx(
      /*sender=*/ deployer,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: avmTestContract.address,
          fnName: 'bulk_testing',
          args,
        },
      ],
      /*teardownCall=*/ undefined, // use default
      /*feePayer=*/ undefined, // use default
      /*firstNullifier=*/ undefined, // use default
      /*globals=*/ undefined, // use default
      /*metricsTag=*/ 'AvmTestContract.bulk_testing',
    );
    expect(bulkResult.revertCode.isOK()).toBe(true);
  });

  describe('AVM gadgets', () => {
    const deployer = AztecAddress.fromNumber(42);
    let avmGadgetsTestContract: ContractInstanceWithAddress;

    beforeAll(async () => {
      avmGadgetsTestContract = await simTester.registerAndDeployContract(
        /*constructorArgs=*/ [],
        deployer,
        /*contractArtifact=*/ AvmGadgetsTestContractArtifact,
      );
    });

    it(`sha256_hash_100`, async () => {
      const result = await simTester.simulateTx(
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'sha256_hash_100',
            args: [/*input=*/ randomMemoryBytes(100).map(e => e.toFr())],
          },
        ],
        /*teardownCall=*/ undefined, // use default
        /*feePayer=*/ undefined, // use default
        /*firstNullifier=*/ undefined, // use default
        /*globals=*/ undefined, // use default
        /*metricsTag=*/ 'AvmGadgetsTestContract.sha256_hash_100',
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it(`sha256_hash_2048`, async () => {
      const result = await simTester.simulateTx(
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'sha256_hash_2048',
            args: [/*input=*/ randomMemoryBytes(2048).map(e => e.toFr())],
          },
        ],
        /*teardownCall=*/ undefined, // use default
        /*feePayer=*/ undefined, // use default
        /*firstNullifier=*/ undefined, // use default
        /*globals=*/ undefined, // use default
        /*metricsTag=*/ 'AvmGadgetsTestContract.sha256_hash_2048',
      );
      expect(result.revertCode.isOK()).toBe(true);
    });
  });

  //describe.each([
  //  ['sha256_hash_10', /*input=*/ randomMemoryBytes(10)],
  //  ['sha256_hash_20', /*input=*/ randomMemoryBytes(20)],
  //  ['sha256_hash_30', /*input=*/ randomMemoryBytes(30)],
  //  ['sha256_hash_40', /*input=*/ randomMemoryBytes(40)],
  //  ['sha256_hash_50', /*input=*/ randomMemoryBytes(50)],
  //  ['sha256_hash_60', /*input=*/ randomMemoryBytes(60)],
  //  ['sha256_hash_70', /*input=*/ randomMemoryBytes(70)],
  //  ['sha256_hash_80', /*input=*/ randomMemoryBytes(80)],
  //  ['sha256_hash_90', /*input=*/ randomMemoryBytes(90)],
  //  ['sha256_hash_100', /*input=*/ randomMemoryBytes(100)],
  //  ['sha256_hash_255', /*input=*/ randomMemoryBytes(255)],
  //  ['sha256_hash_256', /*input=*/ randomMemoryBytes(256)],
  //  ['sha256_hash_511', /*input=*/ randomMemoryBytes(511)],
  //  ['sha256_hash_512', /*input=*/ randomMemoryBytes(512)],
  //  ['sha256_hash_2048', /*input=*/ randomMemoryBytes(2048)],
  //  ['keccak_hash', /*input=*/ randomMemoryBytes(10)],
  //  ['keccak_f1600', /*input=*/ randomMemoryUint64s(25)],
  //  ['poseidon2_hash', /*input=*/ randomMemoryFields(10)],
  //  ['pedersen_hash', /*input=*/ randomMemoryFields(10)],
  //  ['pedersen_hash_with_index', /*input=*/ randomMemoryFields(10)],
  //])('Hashes in noir contracts', (name: string, input: MemoryValue[]) => {
  //  it(`Should execute contract function that performs ${name} on input of length ${input.length}`, async () => {
  //    const calldata = input.map(e => e.toFr());

  //    const context = initContext({ env: initExecutionEnvironment({ calldata }) });
  //    const bytecode = getAvmGadgetsTestContractBytecode(name);
  //    const results = await new AvmSimulator(context).executeBytecode(bytecode);

  //    expect(results.reverted).toBe(false);
  //  });
  //});
});
