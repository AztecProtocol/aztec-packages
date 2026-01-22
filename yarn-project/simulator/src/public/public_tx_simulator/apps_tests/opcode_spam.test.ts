import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { CollectionLimitsConfig, PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { getSpamConfigsPerOpcode, testOpcodeSpamCase } from '../../fixtures/opcode_spammer.js';
import {
  type MeasuredSimulatorFactory,
  PublicTxSimulationTester,
  defaultGlobals,
} from '../../fixtures/public_tx_simulation_tester.js';
import { SimpleContractDataSource } from '../../fixtures/simple_contract_data_source.js';
import { TestExecutorMetrics } from '../../test_executor_metrics.js';
import { MeasuredCppPublicTxSimulator } from '../cpp_public_tx_simulator.js';
import { MeasuredCppVsTsPublicTxSimulator } from '../cpp_vs_ts_public_tx_simulator.js';

// NOTE: This test is meant to be run for benchmarking. Set RUN_AVM_OPCODE_SPAM=1 to enable.
const describeOrSkip = process.env.RUN_AVM_OPCODE_SPAM ? describe : describe.skip;

/**
 * NOTE: Collecting metadata is technically a slow down, especially
 * for opcodes that do lots of nested calls (like side-effect limited spams).
 * We leave it enabled by default so that we can validate that these
 * tests revert in the expected ways.
 */
const COLLECT_META_CHECK_RET = false;
const MAX_CALL_STACK_ITEMS = COLLECT_META_CHECK_RET ? 10000 : 0;
const MAX_CALL_STACK_DEPTH = COLLECT_META_CHECK_RET ? 10000 : 0;
const expectToBeTrue = COLLECT_META_CHECK_RET ? (x: boolean) => expect(x).toBe(true) : () => {};

describeOrSkip('Opcode Spammer Benchmarks', () => {
  const logger = createLogger('opcode-spam-bench');

  // Get all test cases from the spammer config (grouped by opcode)
  const groupedSpamConfigs = getSpamConfigsPerOpcode();

  // Shared metrics instance for benchmark collection
  const metrics = new TestExecutorMetrics(logger);

  // Benchmark config - disable most collection for speed
  const config: PublicSimulatorConfig = PublicSimulatorConfig.from({
    skipFeeEnforcement: false,
    collectCallMetadata: COLLECT_META_CHECK_RET,
    collectDebugLogs: false,
    collectHints: false,
    collectPublicInputs: false,
    collectStatistics: false,
    // Increase call stack limits for nested call tests (defaults are too low for some opcodes)
    collectionLimits: CollectionLimitsConfig.from({
      maxCallStackItems: MAX_CALL_STACK_ITEMS,
      maxCallStackDepth: MAX_CALL_STACK_DEPTH,
    }),
  });

  afterAll(() => {
    if (process.env.BENCH_OUTPUT) {
      mkdirSync(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      writeFileSync(process.env.BENCH_OUTPUT, metrics.toGithubActionBenchmarkJSON());
    } else if (process.env.BENCH_OUTPUT_MD) {
      writeFileSync(process.env.BENCH_OUTPUT_MD, metrics.toPrettyString());
    }
    logger.info(`\n`); // sometimes jest tests obscure the last line(s)
    logger.info(metrics.toPrettyString());
  });

  describe.each([
    // NOTE: Cpp vs TS simulation is very slow (because TS is slow), so we skip it by default.
    // It is useful to manually run to make sure these tests perform identically between simulators.
    //{ useCppSimulator: false, simulatorName: 'CppVsTs' },
    { useCppSimulator: true, simulatorName: 'Cpp' },
  ])('($simulatorName) Simulator', ({ useCppSimulator, simulatorName }) => {
    const metricsPrefix = simulatorName;

    let worldStateService: NativeWorldStateService;
    let tester: PublicTxSimulationTester;

    beforeEach(async () => {
      worldStateService = await NativeWorldStateService.tmp(EthAddress.ZERO, true, [], logger);
      const contractDataSource = new SimpleContractDataSource(logger);
      const merkleTree = await worldStateService.fork();
      const simulatorFactory: MeasuredSimulatorFactory = useCppSimulator
        ? (mt, cdb, g, log, m, c) => new MeasuredCppPublicTxSimulator(mt, cdb, g, log, m, c)
        : (mt, cdb, g, log, m, c) => new MeasuredCppVsTsPublicTxSimulator(mt, cdb, g, log, m, c);
      tester = new PublicTxSimulationTester(
        logger,
        merkleTree,
        contractDataSource,
        defaultGlobals(),
        metrics,
        simulatorFactory,
        config,
      );
      tester.setMetricsPrefix(`${metricsPrefix} Opcode Spam`);
    });

    afterEach(async () => {
      await worldStateService.close();
    });

    describe.each(groupedSpamConfigs)('$opcode', ({ configs }) => {
      it.each(configs)('$label', async config => {
        await testOpcodeSpamCase(tester, config, expectToBeTrue);
      });
    });
  });
});
