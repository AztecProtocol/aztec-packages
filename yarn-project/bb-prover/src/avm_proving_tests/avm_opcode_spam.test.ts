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
  ARITHMETIC_TYPE_VARIANTS,
  BITWISE_TYPE_VARIANTS,
  Opcode,
  SPAM_CONFIGS,
  createMaxSizeLogNestedBytecode,
  createNestedSpamBytecode,
  createSpamBytecode,
  createSpamBytecodeFromConfig,
  expandTypeVariants,
  getSpammableOpcodes,
  isSideEffectLimited,
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

  // =========================================================================
  // All gas-limited opcodes (run until out-of-gas)
  // Each opcode tested exactly once with default config
  // =========================================================================
  describe('Gas-limited opcodes', () => {
    it.each(withNames(gasLimitedOpcodes))(
      '$name',
      async ({ opcode, name }) => {
        const { bytecode } = createSpamBytecode(opcode);
        const result = await testCustomBytecode(bytecode, tester, name);
        // Should have reverted due to out-of-gas
        expect(result.revertCode.isOK()).toBe(false);
      },
      600_000,
    );
  });

  // =========================================================================
  // Side-effect-limited opcodes using nested call pattern
  // Outer contract loops calling inner contract (which does limit-1 side effects + reverts)
  // This allows thousands of iterations until out-of-gas
  // =========================================================================
  describe('Side-effect-limited opcodes (spammed via reverting nested calls)', () => {
    it.each(withNames(sideEffectLimitedOpcodes))(
      '$name',
      async ({ opcode, name }) => {
        const { innerBytecode, createOuterBytecode } = createNestedSpamBytecode(opcode);
        const result = await testNestedCustomBytecode(innerBytecode, createOuterBytecode, tester, name);
        // Should have reverted (outer runs until out-of-gas)
        expect(result.revertCode.isOK()).toBe(false);
      },
      600_000,
    );
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
      // Should have reverted (outer runs until out-of-gas)
      expect(result.revertCode.isOK()).toBe(false);
    }, 600_000);
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
        it.each(variants)(
          '%s',
          async (label, variantConfig) => {
            const { bytecode } = createSpamBytecodeFromConfig(variantConfig);
            const result = await testCustomBytecode(bytecode, tester, label);
            // Should have reverted due to out-of-gas
            expect(result.revertCode.isOK()).toBe(false);
          },
          1000_000,
        );
      });
    }
  });
});
