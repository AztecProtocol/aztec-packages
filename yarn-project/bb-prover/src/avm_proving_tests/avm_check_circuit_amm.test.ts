import { createLogger } from '@aztec/foundation/log';
import { AMMContractArtifact } from '@aztec/noir-contracts.js/AMM';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { TestExecutorMetrics, ammTest, defaultGlobals } from '@aztec/simulator/public/fixtures';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 60_000;

describe('AVM proven AMM', () => {
  const logger = createLogger('avm-proven-tests-amm');
  const metrics = new TestExecutorMetrics();
  let tester: AvmProvingTester;

  beforeEach(async () => {
    // Check-circuit only (no full proving).
    tester = await AvmProvingTester.new(/*checkCircuitOnly=*/ true, /*globals=*/ defaultGlobals(), metrics);
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
    'proven AMM operations: addLiquidity, swap, removeLiquidity (simulates constructors, set_minter)',
    async () => {
      await ammTest(tester, logger, TokenContractArtifact, AMMContractArtifact, (b: boolean) => expect(b).toBe(true));
    },
    TIMEOUT,
  );
});
