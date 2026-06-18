import {
  addressingWithBaseTagIssueTest,
  addressingWithIndirectTagIssueTest,
  addressingWithIndirectThenRelativeTagIssueTest,
  addressingWithRelativeOverflowAndIndirectTagIssueTest,
  castTruncationTest,
  defaultGlobals,
  instructionTruncatedTest,
  invalidByteTest,
  invalidOpcodeTest,
  invalidTagValueAndInstructionTruncatedTest,
  invalidTagValueTest,
  pcOutOfRangeTest,
  setFieldOverflowTest,
  setTruncationTest,
} from '@aztec/simulator/public/fixtures';
import { NativeWorldStateService } from '@aztec/world-state';

import { AvmProvingTester } from './avm_proving_tester.js';

describe('AVM custom bytecodes unhappy paths', () => {
  let tester: AvmProvingTester;
  let worldStateService: NativeWorldStateService;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await AvmProvingTester.new(worldStateService, /*checkCircuitOnly*/ true, /*globals=*/ defaultGlobals());
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  it('Base address uninitialized indirect relative', async () => {
    const result = await addressingWithBaseTagIssueTest(/*isIndirect=*/ true, tester);
    expect(result.revertCode.isOK()).toBe(false);
  }, 20_000);

  it('Base address uninitialized direct relative', async () => {
    const result = await addressingWithBaseTagIssueTest(/*isIndirect=*/ false, tester);
    expect(result.revertCode.isOK()).toBe(false);
  }, 20_000);

  it('Indirect address with invalid tag', async () => {
    const result = await addressingWithIndirectTagIssueTest(tester);
    expect(result.revertCode.isOK()).toBe(false);
  }, 20_000);

  it('Indirect addressing succeeds, then relative addressing fails due to wrong base tag', async () => {
    const result = await addressingWithIndirectThenRelativeTagIssueTest(tester);
    expect(result.revertCode.isOK()).toBe(false);
  }, 20_000);

  it('Indirect relative addressing overflows, then indirect addressing fails', async () => {
    const result = await addressingWithRelativeOverflowAndIndirectTagIssueTest(tester);
    expect(result.revertCode.isOK()).toBe(false);
  }, 20_000);
});

describe('AVM bytecode flow unhappy paths', () => {
  let tester: AvmProvingTester;
  let worldStateService: NativeWorldStateService;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await AvmProvingTester.new(worldStateService, /*checkCircuitOnly*/ true, /*globals=*/ defaultGlobals());
  });

  afterEach(async () => {
    await worldStateService.close();
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

describe('AVM custom bytecodes truncation', () => {
  let tester: AvmProvingTester;
  let worldStateService: NativeWorldStateService;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await AvmProvingTester.new(worldStateService, /*checkCircuitOnly*/ true, /*globals=*/ defaultGlobals());
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  it('SET truncation to narrower target tags', async () => {
    const result = await setTruncationTest(tester);
    expect(result.revertCode.isOK()).toBe(true);
  }, 20_000);

  it('CAST truncation to narrower target tags', async () => {
    const result = await castTruncationTest(tester);
    expect(result.revertCode.isOK()).toBe(true);
  }, 20_000);

  it('SET_FF immediate overflowing the field modulus is reduced mod p', async () => {
    const result = await setFieldOverflowTest(tester);
    expect(result.revertCode.isOK()).toBe(true);
  }, 20_000);
});
