/**
 * Opcode Spammer Proving Test Suite
 *
 * Tests all spammable opcodes using the data-driven implementation with real AVM proving.
 * Uses smallest wire formats (_8) for maximum instruction density.
 *
 * This test is meant to be run locally for measurements. It is skipped in CI.
 */
import { createLogger } from '@aztec/foundation/log';
import {
  createNestedSpamBytecodeFromConfig,
  createSpamBytecodeFromConfig,
  getAllSpamTestCases,
} from '@aztec/simulator/public/avm/opcode_spammer';
import {
  TestExecutorMetrics,
  defaultGlobals,
  testCustomBytecode,
  testNestedCustomBytecode,
} from '@aztec/simulator/public/fixtures';
import { NativeWorldStateService } from '@aztec/world-state';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { AvmProvingTester } from './avm_proving_tester.js';

// Get all test cases from the spammer config (hierarchical by opcode)
const allTestCases = getAllSpamTestCases();

// Note: this test is meant to be run locally for measurements. It is skipped in CI.
describe('AVM Opcode Spammer Proving Benchmarks', () => {
  const logger = createLogger('avm-opcode-spam-proving');

  // Shared metrics instance for benchmark collection
  const metrics = new TestExecutorMetrics();

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

  // Full proving only (no check-circuit mode)
  let worldStateService: NativeWorldStateService;
  let tester: AvmProvingTester;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
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

  // Unified test loop - handles both gas-limited and side-effect-limited opcodes
  describe.each(allTestCases)('$opcode', ({ opcode, cases }) => {
    it.each(cases.map(c => ({ ...c, opcode })))(
      '$variant',
      async ({ opcode, variant, config, isNested }) => {
        const label = variant !== opcode ? `${opcode}/${variant}` : opcode;
        if (isNested) {
          const { innerBytecode, createOuterBytecode } = createNestedSpamBytecodeFromConfig(config);
          await testNestedCustomBytecode(innerBytecode, createOuterBytecode, tester, label);
        } else {
          const { bytecode } = createSpamBytecodeFromConfig(config);
          await testCustomBytecode(bytecode, tester, label);
        }
        // No result checks - this is for proving benchmarks only
      },
      600_000,
    );
  });
});
