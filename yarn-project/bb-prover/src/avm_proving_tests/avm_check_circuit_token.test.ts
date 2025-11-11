import { createLogger } from '@aztec/foundation/log';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { TestExecutorMetrics, defaultGlobals, tokenTest } from '@aztec/simulator/public/fixtures';
import { NativeWorldStateService } from '@aztec/world-state';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 60_000;

describe('AVM proven TokenContract', () => {
  const logger = createLogger('avm-proven-tests-token');
  const metrics = new TestExecutorMetrics();
  let tester: AvmProvingTester;
  let worldStateService: NativeWorldStateService;

  beforeAll(async () => {
    // Check-circuit only (no full proving).
    worldStateService = await NativeWorldStateService.tmp();
    tester = await AvmProvingTester.new(
      worldStateService,
      /*checkCircuitOnly=*/ true,
      /*globals=*/ defaultGlobals(),
      metrics,
    );
  });

  afterAll(async () => {
    await worldStateService.close();
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
    'proven token transfer (simulates constructor, mint, burn, check balance)',
    async () => {
      await tokenTest(tester, logger, TokenContractArtifact, (b: boolean) => expect(b).toBe(true));
    },
    TIMEOUT,
  );
});
