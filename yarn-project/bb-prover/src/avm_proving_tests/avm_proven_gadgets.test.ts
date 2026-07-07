import { randomInt } from '@aztec/foundation/crypto/random';
import { createLogger } from '@aztec/foundation/log';
import { AvmGadgetsTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmGadgetsTest';
import { TestExecutorMetrics, defaultGlobals } from '@aztec/simulator/public/fixtures';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { NativeWorldStateService } from '@aztec/world-state';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { AvmProvingTester } from './avm_proving_tester.js';

// Note: this test is meant to be run locally for measurements. It is skipped in CI.
describe.skip('AVM proven gadgets test', () => {
  const logger = createLogger('avm-proven-gadgets-test');
  let tester: AvmProvingTester;
  const metrics = new TestExecutorMetrics();
  let worldStateService: NativeWorldStateService;

  const sender = AztecAddress.fromNumber(42);
  let avmGadgetsTestContract: ContractInstanceWithAddress;

  beforeEach(async () => {
    // FULL PROVING! Not check-circuit.
    worldStateService = await NativeWorldStateService.tmp();
    tester = await AvmProvingTester.new(
      worldStateService,
      /*checkCircuitOnly=*/ false,
      /*globals=*/ defaultGlobals(),
      metrics,
    );
    tester.setMetricsPrefix(`AvmGadgetsTest contract tests`);
    avmGadgetsTestContract = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      sender,
      /*contractArtifact=*/ AvmGadgetsTestContractArtifact,
    );
  });

  afterEach(async () => {
    await tester.close();
    await worldStateService.close();
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

  it('keccak_hash_1400', async () => {
    const result = await tester.executeTxWithLabel(
      /*txLabel=*/ 'AvmGadgetsTest/keccak_hash_1400',
      /*sender=*/ sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: avmGadgetsTestContract.address,
          fnName: 'keccak_hash_1400',
          args: [/*input=*/ Array.from({ length: 1400 }, () => randomInt(2 ** 8))],
        },
      ],
    );
    expect(result.revertCode.isOK()).toBe(true);
  }, 180_000);

  it('sha256_hash_1536', async () => {
    const result = await tester.executeTxWithLabel(
      /*txLabel=*/ 'AvmGadgetsTest/sha256_hash_1536',
      /*sender=*/ sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: avmGadgetsTestContract.address,
          fnName: 'sha256_hash_1536',
          args: [/*input=*/ Array.from({ length: 1536 }, () => randomInt(2 ** 8))],
        },
      ],
    );
    expect(result.revertCode.isOK()).toBe(true);
  }, 180_000);

  it('poseidon2_hash_1000fields', async () => {
    const result = await tester.executeTxWithLabel(
      /*txLabel=*/ 'AvmGadgetsTest/poseidon2_hash_1000fields',
      /*sender=*/ sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: avmGadgetsTestContract.address,
          fnName: 'poseidon2_hash_1000fields',
          args: [/*input=*/ Array.from({ length: 2000 }, () => randomInt(2 ** 8))],
        },
      ],
    );
    expect(result.revertCode.isOK()).toBe(true);
  }, 300_000);
});

describe('AVM proven gadgets test: test vectors', () => {
  let tester: AvmProvingTester;
  let worldStateService: NativeWorldStateService;

  const sender = AztecAddress.fromNumber(42);
  let avmGadgetsTestContract: ContractInstanceWithAddress;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await AvmProvingTester.new(worldStateService, /*checkCircuitOnly=*/ false, /*globals=*/ defaultGlobals());
    avmGadgetsTestContract = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      sender,
      /*contractArtifact=*/ AvmGadgetsTestContractArtifact,
    );
  });

  afterEach(async () => {
    await tester.close();
    await worldStateService.close();
  });

  it('keccak_hash_test_vector', async () => {
    // keccak256([0x00, 0x01, ..., 0x09]) = f0ae86a6257e615bce8b0fe73794934deda00c13d58f80b466a9354e306c9eb0
    const input = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09];
    const result = await tester.executeTxWithLabel(
      /*txLabel=*/ 'AvmGadgetsTest/keccak_hash',
      /*sender=*/ sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: avmGadgetsTestContract.address,
          fnName: 'keccak_hash',
          args: [input],
        },
      ],
    );
    expect(result.revertCode.isOK()).toBe(true);
    const outputBytes = result.getAppLogicReturnValues()?.[0]?.values?.map(fr => Number(fr.toBigInt()));
    const expected = [...Buffer.from('f0ae86a6257e615bce8b0fe73794934deda00c13d58f80b466a9354e306c9eb0', 'hex')];
    expect(outputBytes).toEqual(expected);
  }, 180_000);

  it('keccak_hash_test_vector_300bytes', async () => {
    // 300 bytes exceeds the keccak256 rate (136 bytes), triggering multi-block permutation.
    // keccak256([0x00, 0x01, ..., 0x2b, 0x00, 0x01, ..., 0x2b, ...]) for 300 bytes
    const input = Array.from({ length: 300 }, (_, i) => i % 256);
    const result = await tester.executeTxWithLabel(
      /*txLabel=*/ 'AvmGadgetsTest/keccak_hash_300',
      /*sender=*/ sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: avmGadgetsTestContract.address,
          fnName: 'keccak_hash_300',
          args: [input],
        },
      ],
    );
    expect(result.revertCode.isOK()).toBe(true);
    const outputBytes = result.getAppLogicReturnValues()?.[0]?.values?.map(fr => Number(fr.toBigInt()));
    const expected = [...Buffer.from('a679e749a6af300c36e7ff2255d220864eab27b382f9cfdc5aa4d13563ba36ff', 'hex')];
    expect(outputBytes).toEqual(expected);
  }, 180_000);

  it('sha256_hash_test_vector', async () => {
    // sha256([0x00, 0x01, ..., 0x09]) = 1f825aa2f0020ef7cf91dfa30da4668d791c5d4824fc8e41354b89ec05795ab3
    const input = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09];
    const result = await tester.executeTxWithLabel(
      /*txLabel=*/ 'AvmGadgetsTest/sha256_hash_10',
      /*sender=*/ sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: avmGadgetsTestContract.address,
          fnName: 'sha256_hash_10',
          args: [input],
        },
      ],
    );
    expect(result.revertCode.isOK()).toBe(true);
    const outputBytes = result.getAppLogicReturnValues()?.[0]?.values?.map(fr => Number(fr.toBigInt()));
    const expected = [...Buffer.from('1f825aa2f0020ef7cf91dfa30da4668d791c5d4824fc8e41354b89ec05795ab3', 'hex')];
    expect(outputBytes).toEqual(expected);
  }, 180_000);

  it('sha256_hash_test_vector_255bytes', async () => {
    // 255 bytes exceeds the sha256 block size (64 bytes), triggering multi-block compression.
    // sha256([0x00, 0x01, ..., 0xfe]) = 3f8591112c6bbe5c963965954e293108b7208ed2af893e500d859368c654eabe
    const input = Array.from({ length: 255 }, (_, i) => i);
    const result = await tester.executeTxWithLabel(
      /*txLabel=*/ 'AvmGadgetsTest/sha256_hash_255',
      /*sender=*/ sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: avmGadgetsTestContract.address,
          fnName: 'sha256_hash_255',
          args: [input],
        },
      ],
    );
    expect(result.revertCode.isOK()).toBe(true);
    const outputBytes = result.getAppLogicReturnValues()?.[0]?.values?.map(fr => Number(fr.toBigInt()));
    const expected = [...Buffer.from('3f8591112c6bbe5c963965954e293108b7208ed2af893e500d859368c654eabe', 'hex')];
    expect(outputBytes).toEqual(expected);
  }, 180_000);
});
