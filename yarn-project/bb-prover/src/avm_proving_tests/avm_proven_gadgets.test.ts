import { randomInt } from '@aztec/foundation/crypto';
import { createLogger } from '@aztec/foundation/log';
import { AvmGadgetsTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmGadgetsTest';
import { TestExecutorMetrics, defaultGlobals } from '@aztec/simulator/public/fixtures';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { AvmProvingTester } from './avm_proving_tester.js';

// Note: this test is meant to be run locally for measurements. It is skipped in CI.
describe.skip('AVM proven gadgets test', () => {
  const logger = createLogger('avm-proven-gadgets-test');
  let tester: AvmProvingTester;
  const metrics = new TestExecutorMetrics();

  const sender = AztecAddress.fromNumber(42);
  let avmGadgetsTestContract: ContractInstanceWithAddress;

  beforeEach(async () => {
    // FULL PROVING! Not check-circuit.
    tester = await AvmProvingTester.new(/*checkCircuitOnly=*/ false, /*globals=*/ defaultGlobals(), metrics);
    tester.setMetricsPrefix(`AvmGadgetsTest contract tests`);
    avmGadgetsTestContract = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      sender,
      /*contractArtifact=*/ AvmGadgetsTestContractArtifact,
    );
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
          args: [/*input=*/ Array.from({ length: 2400 }, () => randomInt(2 ** 8))],
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
