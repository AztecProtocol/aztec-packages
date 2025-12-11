/**
 * Opcode Spammer Test Suite
 *
 * Tests all spammable opcodes using the data-driven implementation.
 * Uses smallest wire formats (_8) for maximum instruction density.
 */
import { createLogger } from '@aztec/foundation/log';
import { CallStackMetadata, CollectionLimitsConfig, PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import {
  createNestedSpamBytecodeFromConfig,
  createSpamBytecodeFromConfig,
  getAllSpamTestCases,
} from '../../avm/opcode_spammer/opcode_spammer.js';
import { testCustomBytecode, testNestedCustomBytecode } from '../../fixtures/custom_bytecode_tester.js';
import {
  type MeasuredSimulatorFactory,
  PublicTxSimulationTester,
  defaultGlobals,
} from '../../fixtures/public_tx_simulation_tester.js';
import { SimpleContractDataSource } from '../../fixtures/simple_contract_data_source.js';
import { TestExecutorMetrics } from '../../test_executor_metrics.js';
import { MeasuredCppPublicTxSimulator } from '../cpp_public_tx_simulator.js';
import { MeasuredCppVsTsPublicTxSimulator } from '../cpp_vs_ts_public_tx_simulator.js';
import { MeasuredPublicTxSimulator } from '../measured_public_tx_simulator.js';

// TIP: Filter on "Cpp" to run tests faster (e.g., yarn test ... -t "Cpp")

// Toggle this to enable Cpp vs TS sim comparisons instead of regular TS sim.
// When true, tests also verify that out-of-gas reverts contain "gas" in the message.
// Requires collectCallMetadata: true in the config below.
const COMPARE_CPP_VS_TS = true;

// Get all test cases from the spammer config (hierarchical by opcode)
const allTestCases = getAllSpamTestCases();

describe('Opcode Spammer Benchmarks', () => {
  const logger = createLogger('opcode-spam-bench');

  // Shared metrics instance for benchmark collection
  const metrics = new TestExecutorMetrics();

  // Benchmark config - disable most collection for speed
  const config: PublicSimulatorConfig = PublicSimulatorConfig.from({
    skipFeeEnforcement: false,
    collectCallMetadata: COMPARE_CPP_VS_TS,
    collectDebugLogs: false,
    collectHints: false,
    collectPublicInputs: false,
    collectStatistics: false,
    // Increase call stack limit for nested call tests (default 100 is too low for some opcodes)
    collectionLimits: CollectionLimitsConfig.from({ maxCallStackItems: 10000 }),
  });

  // Helper to assert out-of-gas revert (conditionally checks message)
  const expectOutOfGasRevert = (result: Awaited<ReturnType<typeof testCustomBytecode>>) => {
    expect(result.revertCode.isOK()).toBe(false);
    if (COMPARE_CPP_VS_TS) {
      const revertReason = result.findRevertReason();
      expect(revertReason?.message.toLowerCase()).toMatch(/out of gas|not enough l2gas/);
    }
  };

  // Helper to assert nested call revert with simulator-specific expectations
  const expectNestedCallOutOfGasRevert = (
    result: Awaited<ReturnType<typeof testNestedCustomBytecode>>,
    useCppSimulator: boolean,
  ) => {
    expect(result.revertCode.isOK()).toBe(false);
    if (COMPARE_CPP_VS_TS) {
      const innerRevertReason = result.findRevertReason();
      // Nested call will either explicitly REVERT or run out of gas.
      expect(innerRevertReason?.message.toLowerCase()).toMatch(/assertion failed|out of gas|not enough l2gas/);
      if (useCppSimulator) {
        // haltingMessage is only available in CallStackMetadata from C++ simulator
        // Top-level should _always_ run out of gas for these tests
        const outerCallMetadata = result.callStackMetadata[0] as CallStackMetadata;
        expect(outerCallMetadata.haltingMessage?.toLowerCase()).toMatch(/out of gas|not enough l2gas/);
      }
    }
  };

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

  describe.each([
    { useCppSimulator: false, simulatorName: 'TS Simulator' },
    { useCppSimulator: true, simulatorName: 'Cpp Simulator' },
  ])('($simulatorName)', ({ useCppSimulator }) => {
    const metricsPrefix = useCppSimulator ? 'Cpp' : 'TS';

    let worldStateService: NativeWorldStateService;
    let tester: PublicTxSimulationTester;

    beforeEach(async () => {
      worldStateService = await NativeWorldStateService.tmp();
      const contractDataSource = new SimpleContractDataSource();
      const merkleTree = await worldStateService.fork();
      const simulatorFactory: MeasuredSimulatorFactory = useCppSimulator
        ? (mt, cdb, g, m, c) => new MeasuredCppPublicTxSimulator(mt, cdb, g, m, c)
        : COMPARE_CPP_VS_TS
          ? (mt, cdb, g, m, c) => new MeasuredCppVsTsPublicTxSimulator(mt, cdb, g, m, c)
          : (mt, cdb, g, m, c) => new MeasuredPublicTxSimulator(mt, cdb, g, m, c);
      tester = new PublicTxSimulationTester(
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

    // Unified test loop - handles both gas-limited and side-effect-limited opcodes
    describe.each(allTestCases)('$opcode', ({ opcode, cases }) => {
      it.each(cases.map(c => ({ ...c, opcode })))('$variant', async ({ opcode, variant, config, isNested }) => {
        const label = variant !== opcode ? `${opcode}/${variant}` : opcode;
        if (isNested) {
          const { innerBytecode, createOuterBytecode } = createNestedSpamBytecodeFromConfig(config);
          const result = await testNestedCustomBytecode(innerBytecode, createOuterBytecode, tester, label);
          expectNestedCallOutOfGasRevert(result, useCppSimulator);
        } else {
          const { bytecode } = createSpamBytecodeFromConfig(config);
          const result = await testCustomBytecode(bytecode, tester, label);
          expectOutOfGasRevert(result);
        }
      });
    });
  });
});
