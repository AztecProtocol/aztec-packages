import { createLogger } from '@aztec/foundation/log';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { TestExecutorMetrics, bulkTest, defaultGlobals } from '@aztec/simulator/public/fixtures';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 180_000;

describe('AVM proven bulk test', () => {
  const logger = createLogger('avm-bulk-test');
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
    }

    // Always print the metrics.
    logger.info(`\n`); // sometimes jest tests obscure the last line(s)
    logger.info(metrics.toPrettyString());
  });

  it(
    'Prove and verify',
    async () => {
      const result = await bulkTest(tester, logger, AvmTestContractArtifact);
      expect(result.revertCode.isOK()).toBe(true);
    },
    TIMEOUT,
  );
});
