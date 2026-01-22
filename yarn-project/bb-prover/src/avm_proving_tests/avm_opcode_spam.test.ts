import { createLogger } from '@aztec/foundation/log';
import {
  TestExecutorMetrics,
  defaultGlobals,
  getSpamConfigsPerOpcode,
  testOpcodeSpamCase,
} from '@aztec/simulator/public/fixtures';
import type { NativeWorldStateService } from '@aztec/world-state';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { AvmProvingTester, createTmpWorldState } from './avm_proving_tester.js';

// NOTE: this test is meant to be run locally for measurements or via bb-prover/bootstrap.sh.
// Set RUN_AVM_OPCODE_SPAM=1 to enable.
const describeOrSkip = process.env.RUN_AVM_OPCODE_SPAM ? describe : describe.skip;

describeOrSkip('AVM Opcode Spammer Proving Benchmarks', () => {
  const logger = createLogger('avm-opcode-spam-proving');

  // Get test cases from the spammer config (grouped by opcode)
  // Limit to 2 configs per opcode otherwise this suite will take hours
  const groupedSpamConfigs = getSpamConfigsPerOpcode(/*maxConfigsPerOpcode=*/ 2);

  // Shared metrics instance for benchmark collection
  const metrics = new TestExecutorMetrics(logger);
  // Full proving only (no check-circuit mode)
  let worldStateService: NativeWorldStateService;
  let tester: AvmProvingTester;

  afterAll(() => {
    if (process.env.BENCH_OUTPUT) {
      mkdirSync(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      writeFileSync(process.env.BENCH_OUTPUT, metrics.toGithubActionBenchmarkJSON());
    } else if (process.env.BENCH_OUTPUT_MD) {
      writeFileSync(process.env.BENCH_OUTPUT_MD, metrics.toPrettyString());
    } else {
      logger.info(`\n`);
      logger.info(metrics.toPrettyString());
    }
  });

  beforeEach(async () => {
    worldStateService = await createTmpWorldState();
    // FULL PROVING! Not check-circuit.
    tester = await AvmProvingTester.new(
      worldStateService,
      /*checkCircuitOnly=*/ false,
      /*globals=*/ defaultGlobals(),
      metrics,
    );
    tester.setMetricsPrefix(`FullProving Opcode Spam`);
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  describe.each(groupedSpamConfigs)('$opcode', ({ configs }) => {
    it.each(configs)(
      '$label',
      async config => {
        await testOpcodeSpamCase(tester, config);
      },
      600_000,
    );
  });
});
