import { createLogger } from '@aztec/foundation/log';

import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';
import { ammTest } from './amm_test.js';

describe('AVM Witgen & Circuit apps tests: AMM', () => {
  const logger = createLogger('public-tx-apps-tests-amm');

  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    tester = await PublicTxSimulationTester.create();
  });

  it('amm operations', async () => {
    await ammTest(tester, logger);
  });
});
