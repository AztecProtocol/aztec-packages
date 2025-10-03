import {
  addressingWithBaseTagIssueTest,
  defaultGlobals,
  instructionTruncatedTest,
  invalidByteTest,
  invalidOpcodeTest,
  invalidTagValueAndInstructionTruncatedTest,
  invalidTagValueTest,
  pcOutOfRangeTest,
} from '@aztec/simulator/public/fixtures';

import { AvmProvingTester } from './avm_proving_tester.js';

describe('AVM custom bytecodes unhappy paths', () => {
  let tester: AvmProvingTester;

  beforeEach(async () => {
    tester = await AvmProvingTester.new(/*checkCircuitOnly*/ true, /*globals=*/ defaultGlobals());
  });

  it('Base address uninitialized indirect relative', async () => {
    const result = await addressingWithBaseTagIssueTest(/*isIndirect=*/ true, tester);
    expect(result.revertCode.isOK()).toBe(false);
  }, 20_000);

  it('Base address uninitialized direct relative', async () => {
    const result = await addressingWithBaseTagIssueTest(/*isIndirect=*/ false, tester);
    expect(result.revertCode.isOK()).toBe(false);
  }, 20_000);
});

describe('AVM bytecode flow unhappy paths', () => {
  let tester: AvmProvingTester;

  beforeEach(async () => {
    tester = await AvmProvingTester.new(/*checkCircuitOnly*/ true, /*globals=*/ defaultGlobals());
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
