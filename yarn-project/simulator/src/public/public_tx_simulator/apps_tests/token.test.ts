import { createLogger } from '@aztec/foundation/log';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';

import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';
import { tokenTest } from '../../fixtures/token_test.js';

describe('Public TX simulator apps tests: TokenContract', () => {
  const logger = createLogger('public-tx-apps-tests-token');

  let tester: PublicTxSimulationTester;

  beforeAll(async () => {
    tester = await PublicTxSimulationTester.create();
  });

  it('token constructor, mint, transfer, burn, check balances)', async () => {
    await tokenTest(tester, logger, TokenContractArtifact, (b: boolean) => expect(b).toBe(true));
  });
});
