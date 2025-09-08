import { Opcode } from '../../avm/serialization/instruction_serialization.js';
import { executeOpcodeSpam } from '../../fixtures/opcode_spammer_examples.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: Spammy contracts', () => {
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
    // Test regular mode for all opcodes
    it(`${opcodeName} runs max times without running out of gas`, async () => {
      const result = await executeOpcodeSpam(opcode, tester, false);
      expect(result.revertCode.isOK()).toBe(true);
    });

    it(`${opcodeName} runs until gas exhaustion in an infinite loop`, async () => {
      const result = await executeOpcodeSpam(opcode, tester, true);
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
  });
});
