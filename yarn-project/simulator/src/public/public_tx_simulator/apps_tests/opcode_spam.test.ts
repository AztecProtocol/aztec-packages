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
  ARITHMETIC_TYPE_VARIANTS,
  BITWISE_TYPE_VARIANTS,
  SPAM_CONFIGS,
  createMaxSizeLogNestedBytecode,
  createNestedSpamBytecode,
  createSpamBytecode,
  createSpamBytecodeFromConfig,
  expandTypeVariants,
  getSpammableOpcodes,
  isSideEffectLimited,
} from '../../avm/opcode_spammer/opcode_spammer.js';
import { Opcode } from '../../avm/serialization/instruction_serialization.js';
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

// Toggle this to enable Cpp vs TS sim comparisons instead of regular TS sim.
// When true, tests also verify that out-of-gas reverts contain "gas" in the message.
// Requires collectCallMetadata: true in the config below.
// TIP: Filter on "Cpp" to run tests faster (e.g., yarn test ... -t "Cpp")
const COMPARE_CPP_VS_TS = false;

// Get all spammable opcodes from config
const allSpammableOpcodes = getSpammableOpcodes();

// Opcodes tested with type variants (excluded from gas-limited section)
const typeVariantOpcodes = new Set([
  // Arithmetic
  Opcode.ADD_8,
  Opcode.SUB_8,
  Opcode.MUL_8,
  Opcode.DIV_8,
  // Bitwise
  Opcode.AND_8,
  Opcode.OR_8,
  Opcode.XOR_8,
  Opcode.NOT_8,
  // Shift
  Opcode.SHL_8,
  Opcode.SHR_8,
  // Comparison
  Opcode.EQ_8,
  Opcode.LT_8,
  Opcode.LTE_8,
  // Memory
  Opcode.CAST_8,
  Opcode.MOV_8,
]);

// Opcodes that only work with integer types (not FIELD)
const integerOnlyOpcodes = new Set([
  Opcode.DIV_8,
  Opcode.AND_8,
  Opcode.OR_8,
  Opcode.XOR_8,
  Opcode.NOT_8,
  Opcode.SHL_8,
  Opcode.SHR_8,
]);

// Separate into gas-limited (excluding type-variant opcodes) and side-effect-limited
const gasLimitedOpcodes = allSpammableOpcodes.filter(op => !isSideEffectLimited(op) && !typeVariantOpcodes.has(op));
const sideEffectLimitedOpcodes = allSpammableOpcodes.filter(op => isSideEffectLimited(op));

// Helper to create test case objects with opcode names
const withNames = (opcodes: Opcode[]) => opcodes.map(op => ({ opcode: op, name: Opcode[op] }));

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
      expect(revertReason?.message.toLowerCase()).toContain('gas');
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

    // =========================================================================
    // All gas-limited opcodes (run until out-of-gas)
    // Each opcode tested exactly once with default config
    // =========================================================================
    describe('Gas-limited opcodes', () => {
      it.each(withNames(gasLimitedOpcodes))('$name', async ({ opcode, name }) => {
        const { bytecode } = createSpamBytecode(opcode);
        const result = await testCustomBytecode(bytecode, tester, name);
        expectOutOfGasRevert(result);
      });
    });

    // =========================================================================
    // Side-effect-limited opcodes using nested call pattern
    // Outer contract loops calling inner contract (which does limit-1 side effects + reverts)
    // This allows thousands of iterations until out-of-gas
    // =========================================================================
    describe('Side-effect-limited opcodes (nested calls)', () => {
      it.each(withNames(sideEffectLimitedOpcodes))('$name', async ({ opcode, name }) => {
        const { innerBytecode, createOuterBytecode } = createNestedSpamBytecode(opcode);
        const result = await testNestedCustomBytecode(innerBytecode, createOuterBytecode, tester, name);
        expect(result.revertCode.isOK()).toBe(false);
        if (COMPARE_CPP_VS_TS) {
          // Inner contract does (limit-1) side effects then intentionally reverts
          const innerRevertReason = result.findRevertReason();
          expect(innerRevertReason?.message.toLowerCase()).toContain('assertion failed');
          // Outer contract loops calling inner until out-of-gas
          const outerCallMetadata = result.callStackMetadata[0] as CallStackMetadata;
          expect(outerCallMetadata.haltingMessage?.toLowerCase()).toContain('gas');
        }
      });
    });

    // =========================================================================
    // EMITUNENCRYPTEDLOG with max-size log
    // Emits a single log that takes up the entire log payload limit per inner call.
    // =========================================================================
    describe('EMITUNENCRYPTEDLOG max-size log (nested calls)', () => {
      it('EMITUNENCRYPTEDLOG_MAXSIZE', async () => {
        const { innerBytecode, createOuterBytecode } = createMaxSizeLogNestedBytecode();
        const result = await testNestedCustomBytecode(
          innerBytecode,
          createOuterBytecode,
          tester,
          'EMITUNENCRYPTEDLOG_MAXSIZE',
        );
        expect(result.revertCode.isOK()).toBe(false);
        if (COMPARE_CPP_VS_TS) {
          // Inner reverts after emitting the max-size log
          const innerRevertReason = result.findRevertReason();
          expect(innerRevertReason?.message.toLowerCase()).toContain('assertion failed');
          // Outer loops calling inner until out-of-gas
          const outerCallMetadata = result.callStackMetadata[0] as CallStackMetadata;
          expect(outerCallMetadata.haltingMessage?.toLowerCase()).toContain('gas');
        }
      });
    });

    // =========================================================================
    // Type variants - test opcodes with different input types
    // =========================================================================
    describe('Gas-limited opcodes operating on varying types', () => {
      for (const opcode of typeVariantOpcodes) {
        if (!SPAM_CONFIGS[opcode]) {
          continue;
        }

        // Use integer-only variants for opcodes that don't support FIELD
        const variants = integerOnlyOpcodes.has(opcode)
          ? expandTypeVariants(opcode, BITWISE_TYPE_VARIANTS)
          : expandTypeVariants(opcode, ARITHMETIC_TYPE_VARIANTS);

        describe(Opcode[opcode], () => {
          it.each(variants)('%s', async (label, variantConfig) => {
            const { bytecode } = createSpamBytecodeFromConfig(variantConfig);
            const result = await testCustomBytecode(bytecode, tester, label);
            expectOutOfGasRevert(result);
          });
        });
      }
    });
  });
});
