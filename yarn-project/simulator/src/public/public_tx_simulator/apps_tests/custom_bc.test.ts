import {
  addressingWithBaseTagIssueTest,
  addressingWithIndirectTagIssueTest,
  addressingWithIndirectThenRelativeTagIssueTest,
  addressingWithRelativeOverflowAndIndirectTagIssueTest,
} from '@aztec/simulator/public/fixtures';
import { NativeWorldStateService } from '@aztec/world-state/native';

import {
  castTruncationTest,
  instructionTruncatedTest,
  invalidByteTest,
  invalidOpcodeTest,
  invalidTagValueAndInstructionTruncatedTest,
  invalidTagValueTest,
  pcOutOfRangeTest,
  setTruncationTest,
} from '../../fixtures/custom_bytecode_tests.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: custom bytecodes unhappy paths', () => {
  let worldStateService: NativeWorldStateService;
  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await PublicTxSimulationTester.create(worldStateService, /*globals=*/ undefined, /*metrics=*/ undefined);
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  it('Base address uninitialized indirect relative', async () => {
    const result = await addressingWithBaseTagIssueTest(/*isIndirect=*/ true, tester);
    expect(result.revertCode.isOK()).toBe(false);
  });

  it('Base address uninitialized direct relative', async () => {
    const result = await addressingWithBaseTagIssueTest(/*isIndirect=*/ false, tester);
    expect(result.revertCode.isOK()).toBe(false);
  });

  it('Indirect address with invalid tag', async () => {
    const result = await addressingWithIndirectTagIssueTest(tester);
    expect(result.revertCode.isOK()).toBe(false);
  });

  it('Indirect addressing succeeds, then relative addressing fails due to wrong base tag', async () => {
    const result = await addressingWithIndirectThenRelativeTagIssueTest(tester);
    expect(result.revertCode.isOK()).toBe(false);
  });

  it('Indirect relative addressing overflows, then indirect addressing fails', async () => {
    const result = await addressingWithRelativeOverflowAndIndirectTagIssueTest(tester);
    expect(result.revertCode.isOK()).toBe(false);
  });
});

describe('Public TX simulator apps tests: bytecode flow unhappy paths', () => {
  let worldStateService: NativeWorldStateService;
  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await PublicTxSimulationTester.create(worldStateService, /*globals=*/ undefined, /*metrics=*/ undefined);
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

describe('Public TX simulator apps tests: custom bytecodes truncation', () => {
  let worldStateService: NativeWorldStateService;
  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await PublicTxSimulationTester.create(worldStateService, /*globals=*/ undefined, /*metrics=*/ undefined);
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  it('SET truncation to narrower target tags', async () => {
    const result = await setTruncationTest(tester);
    expect(result.revertCode.isOK()).toBe(true);
  });

  it('CAST truncation to narrower target tags', async () => {
    const result = await castTruncationTest(tester);
    expect(result.revertCode.isOK()).toBe(true);
  });
});
