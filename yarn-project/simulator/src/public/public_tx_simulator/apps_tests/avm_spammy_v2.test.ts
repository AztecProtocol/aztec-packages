import { Opcode } from '../../avm/serialization/instruction_serialization.js';
import { createOpcodeSpamConfig, getGasForOpcode } from '../../fixtures/opcode_spammer_examples.js';
import { OpcodeSpammer } from '../../fixtures/opcode_spammer_v2.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: Spammy contracts (v2)', () => {
  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    tester = await PublicTxSimulationTester.create();
  });

  // Comprehensive opcode spam tests
  const testOpcodes = [
    // 8-bit Arithmetic
    Opcode.ADD_8,
    Opcode.SUB_8,
    Opcode.MUL_8,
    Opcode.DIV_8,
    Opcode.FDIV_8,
    // 16-bit Arithmetic
    Opcode.ADD_16,
    Opcode.SUB_16,
    Opcode.MUL_16,
    Opcode.DIV_16,
    // 8-bit Bitwise
    Opcode.AND_8,
    Opcode.OR_8,
    Opcode.XOR_8,
    Opcode.NOT_8,
    Opcode.SHL_8,
    Opcode.SHR_8,
    // 16-bit Bitwise
    Opcode.AND_16,
    Opcode.OR_16,
    Opcode.XOR_16,
    Opcode.NOT_16,
    Opcode.SHL_16,
    Opcode.SHR_16,
    // 8-bit Comparison
    Opcode.EQ_8,
    Opcode.LT_8,
    Opcode.LTE_8,
    // 16-bit Comparison
    Opcode.EQ_16,
    Opcode.LT_16,
    Opcode.LTE_16,
    // Memory/Utility (8-bit)
    Opcode.CAST_8,
    Opcode.MOV_8,
    Opcode.SET_8,
    // Memory/Utility (16-bit and others)
    Opcode.CAST_16,
    Opcode.MOV_16,
    Opcode.SET_16,
    Opcode.SET_32,
    Opcode.SET_64,
    Opcode.SET_128,
    Opcode.SET_FF,
    // Field arithmetic
    Opcode.FDIV_16,
    // Hashing
    Opcode.KECCAKF1600,
    Opcode.POSEIDON2,
    Opcode.SHA256COMPRESSION,
    // Data
    Opcode.CALLDATACOPY,
    Opcode.RETURNDATASIZE,
    Opcode.RETURNDATACOPY,
    Opcode.SUCCESSCOPY,
    // Control Flow
    // Jump will require special handling since it changes pc.
    //Opcode.JUMP_32,
    //Opcode.JUMPI_32,
    //Opcode.INTERNALCALL, // Also changes pc
    // Environment
    Opcode.GETENVVAR_16,
    // World State
    Opcode.SLOAD,
    Opcode.SSTORE,
    Opcode.NOTEHASHEXISTS,
    //Opcode.EMITNOTEHASH, // cannot spam past side-effect limit
    Opcode.NULLIFIEREXISTS,
    //Opcode.EMITNULLIFIER, // cannot spam past side-effect limit
    Opcode.L1TOL2MSGEXISTS,
    Opcode.GETCONTRACTINSTANCE,
    //Opcode.EMITUNENCRYPTEDLOG, // cannot spam past side-effect limit
    //Opcode.SENDL2TOL1MSG, // cannot spam past side-effect limit
    // Misc
    Opcode.DEBUGLOG,
    // Gadgets
    Opcode.ECADD,
    // Conversion
    Opcode.TORADIXBE,
    // External Calls
    Opcode.CALL,
    Opcode.STATICCALL,
  ];

  // Map opcodes to [name, value] pairs for proper test naming
  const testCases = testOpcodes.map(opcode => [Opcode[opcode], opcode] as [string, Opcode]);

  describe.each(testCases)('%s spam tests', (opcodeName: string, opcode: Opcode) => {
    // Test bounded loop mode for all opcodes
    it(`${opcodeName} runs max times without running out of gas (bounded loop)`, async () => {
      // Create the spam config for this opcode
      const config = createOpcodeSpamConfig(opcode, false);

      // Execute the spam contract
      const result = await OpcodeSpammer.executeSpamContract(config, tester, `Bounded${opcodeName}Spam`);

      // Should complete successfully
      expect(result.revertCode.isOK()).toBe(true);
    });

    // Test infinite loop mode for all opcodes
    it(`${opcodeName} runs until gas exhaustion in an infinite loop`, async () => {
      // Create the spam config for this opcode
      const config = createOpcodeSpamConfig(opcode, true);

      // Execute the spam contract
      const result = await OpcodeSpammer.executeSpamContract(config, tester, `Infinite${opcodeName}Spam`);

      // Should run out of gas, not revert with an error
      expect(result.revertCode.isOK()).toBe(false);

      if (opcode === Opcode.CALL || opcode === Opcode.STATICCALL) {
        // Inner calls fail due to no bytecode, and simulator propagates that error "reason" up
        // even though the top-level revert is due to out-of-gas.
        expect(result.revertReason!.message).toContain('No bytecode found');
      } else {
        expect(result.revertReason!.message).toContain('Not enough L2GAS');
      }
    });

    // Test that bounded loop maximizes operations while staying within limits
    it(`${opcodeName} bounded loop maximizes operations`, async () => {
      const config = createOpcodeSpamConfig(opcode, false);
      const buildResult = OpcodeSpammer.createSpamContract(config, tester);

      // Check that we're using most of the available bytecode
      const bytecodeUsage = (buildResult.stats.bytecodeSize * 100) / (2999 * 31);
      tester.logger.info(
        `${opcodeName} bounded loop: ${buildResult.stats.bytecodeSize} bytes (${bytecodeUsage.toFixed(1)}% of max)`,
      );

      // Should use at least 80% of available bytecode (unless gas-limited)
      if (buildResult.stats.estimatedGas < 1000000) {
        expect(bytecodeUsage).toBeGreaterThan(80);
      }
    });

    // Test that infinite loop maximizes bytecode usage
    it(`${opcodeName} infinite loop maximizes bytecode`, async () => {
      const config = createOpcodeSpamConfig(opcode, true);
      const buildResult = OpcodeSpammer.createSpamContract(config, tester);

      // Check that we're using almost all of the available bytecode
      const bytecodeUsage = (buildResult.stats.bytecodeSize * 100) / (2999 * 31);
      tester.logger.info(
        `${opcodeName} infinite loop: ${buildResult.stats.bytecodeSize} bytes (${bytecodeUsage.toFixed(1)}% of max)`,
      );

      // Should use at least 95% of available bytecode
      expect(bytecodeUsage).toBeGreaterThan(95);

      // Should be very close to the limit
      expect(buildResult.stats.bytecodeSize).toBeLessThanOrEqual(2999 * 31);
      expect(buildResult.stats.bytecodeSize).toBeGreaterThan(2999 * 31 * 0.95);
    });
  });

  // Test specific scenarios
  describe('Special scenarios', () => {
    it('handles opcodes with memory setup correctly', async () => {
      // Test an opcode that needs memory setup (e.g., ADD which needs two operands)
      const config = createOpcodeSpamConfig(Opcode.ADD_8, false);
      const result = await OpcodeSpammer.executeSpamContract(config, tester);
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('handles opcodes with large gas costs correctly', async () => {
      // Test an expensive opcode like KECCAKF1600
      const config = createOpcodeSpamConfig(Opcode.KECCAKF1600, false);
      const buildResult = OpcodeSpammer.createSpamContract(config, tester);

      // Should still complete within gas limits
      expect(buildResult.stats.estimatedGas).toBeLessThanOrEqual(10000000);

      // Execute to verify
      const result = await OpcodeSpammer.executeSpamContract(config, tester);
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('creates consistent bytecode sizes for infinite loops', async () => {
      // Test that all infinite loop programs have similar bytecode sizes
      const bytecodes: number[] = [];

      for (const opcode of [Opcode.ADD_8, Opcode.SUB_8, Opcode.MUL_8, Opcode.DIV_8]) {
        const config = createOpcodeSpamConfig(opcode, true);
        const buildResult = OpcodeSpammer.createSpamContract(config, tester);
        bytecodes.push(buildResult.stats.bytecodeSize);
      }

      // All should be within 1% of each other (accounting for different opcode sizes)
      const minSize = Math.min(...bytecodes);
      const maxSize = Math.max(...bytecodes);
      const variance = ((maxSize - minSize) * 100) / minSize;

      expect(variance).toBeLessThan(5); // Allow up to 5% variance
    });
  });
});
