import { addressingWithBaseTagIssueTest } from '@aztec/simulator/public/fixtures';

import {
  instructionTruncatedTest,
  invalidByteTest,
  invalidOpcodeTest,
  invalidTagValueAndInstructionTruncatedTest,
  invalidTagValueTest,
  pcOutOfRangeTest,
} from '../../fixtures/custom_bytecode_tests.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: custom bytecodes unhappy paths', () => {
  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    tester = await PublicTxSimulationTester.create();
  });

  it('Base address uninitialized indirect relative', async () => {
    const result = await addressingWithBaseTagIssueTest(/*isIndirect=*/ true, tester);
    expect(result.revertCode.isOK()).toBe(false);
  });

  it('Base address uninitialized direct relative', async () => {
    const result = await addressingWithBaseTagIssueTest(/*isIndirect=*/ false, tester);
    expect(result.revertCode.isOK()).toBe(false);
  });
});

describe('Public TX simulator apps tests: bytecode flow unhappy paths', () => {
  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    tester = await PublicTxSimulationTester.create();
  });

  it('PC out of range', async () => {
    const result = await pcOutOfRangeTest(tester);
    expect(result.revertCode.isOK()).toBe(false);
  });

  it('Invalid opcode', async () => {
    const result = await invalidOpcodeTest(tester);
    expect(result.revertCode.isOK()).toBe(false);
  });

  it('Invalid byte', async () => {
    const result = await invalidByteTest(tester);
    expect(result.revertCode.isOK()).toBe(false);
  });

  it('Instruction truncated', async () => {
    const result = await instructionTruncatedTest(tester);
    expect(result.revertCode.isOK()).toBe(false);
  });

  it('Invalid tag value', async () => {
    const result = await invalidTagValueTest(tester);
    expect(result.revertCode.isOK()).toBe(false);
  });

  it('Invalid tag value and instruction truncated', async () => {
    const result = await invalidTagValueAndInstructionTruncatedTest(tester);
    expect(result.revertCode.isOK()).toBe(false);
  });
});
