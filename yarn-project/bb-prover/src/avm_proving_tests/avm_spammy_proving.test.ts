import { createLogger } from '@aztec/foundation/log';
import {
  TestExecutorMetrics,
  defaultGlobals,
  executeDivSpamPublicTx,
  executeKeccakSpamPublicTx,
  executePoseidonSpamPublicTx,
  executeSha256SpamPublicTx,
  executeXorSpamPublicTx,
} from '@aztec/simulator/public/fixtures';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 300_000;

describe('AVM proven spammy txs', () => {
  const logger = createLogger('avm-proving-spammy-test');
  const metrics = new TestExecutorMetrics();
  let tester: AvmProvingTester;

  beforeEach(async () => {
    // FULL PROVING! Not check-circuit.
    tester = await AvmProvingTester.new(/*checkCircuitOnly=*/ false, /*globals=*/ defaultGlobals(), metrics);
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

  it(
    'Proving keccak spam',
    async () => {
      const result = await executeKeccakSpamPublicTx(tester);
      expect(result.revertCode.isOK()).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'Proving DIV spam',
    async () => {
      const result = await executeDivSpamPublicTx(tester);
      expect(result.revertCode.isOK()).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'Proving XOR spam',
    async () => {
      const result = await executeXorSpamPublicTx(tester);
      expect(result.revertCode.isOK()).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'Proving Poseidon2 spam',
    async () => {
      const result = await executePoseidonSpamPublicTx(tester);
      expect(result.revertCode.isOK()).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'Proving SHA256 compression spam',
    async () => {
      const result = await executeSha256SpamPublicTx(tester);
      expect(result.revertCode.isOK()).toBe(true);
    },
    TIMEOUT,
  );
});
