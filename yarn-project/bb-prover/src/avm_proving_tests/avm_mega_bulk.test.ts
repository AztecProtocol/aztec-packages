import { createLogger } from '@aztec/foundation/log';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { TestExecutorMetrics, defaultGlobals, megaBulkTest } from '@aztec/simulator/public/fixtures';
import { NativeWorldStateService } from '@aztec/world-state';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 180_000;

// Note: this test is meant to be run locally for measurements. It is skipped in CI.
describe.skip('AVM proven MEGA bulk test', () => {
  const logger = createLogger('avm-proven-bulk-test');
  const metrics = new TestExecutorMetrics();
  let tester: AvmProvingTester;
  let worldStateService: NativeWorldStateService;

  beforeEach(async () => {
    // FULL PROVING! Not check-circuit.
    worldStateService = await NativeWorldStateService.tmp();
    tester = await AvmProvingTester.new(
      worldStateService,
      /*checkCircuitOnly=*/ false,
      /*globals=*/ defaultGlobals(),
      metrics,
    );
  });

  afterEach(async () => {
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

  it(
    'Prove and verify mega bulk test',
    async () => {
      const result = await megaBulkTest(tester, logger, AvmTestContractArtifact);
      expect(result.revertCode.isOK()).toBe(true);
    },
    TIMEOUT,
  );
});
