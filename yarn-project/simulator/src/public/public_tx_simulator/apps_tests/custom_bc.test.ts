import { addressingWithBaseTagIssueTest } from '@aztec/simulator/public/fixtures';

import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: custom bytecodes unhappy paths', () => {
  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    tester = await PublicTxSimulationTester.create();
  });

  it('Base address uninitialized indirect relative', async () => {
    await addressingWithBaseTagIssueTest(/*isIndirect=*/ true, tester);
  });

  it('Base address uninitialized direct relative', async () => {
    await addressingWithBaseTagIssueTest(/*isIndirect=*/ false, tester);
  });
});
