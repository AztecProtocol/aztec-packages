import { createLogger } from '@aztec/foundation/log';
import { AMMContractArtifact } from '@aztec/noir-contracts.js/AMM';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';

import { ammTest } from '../../fixtures/amm_test.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: AMM Contract', () => {
  const logger = createLogger('public-tx-apps-tests-amm');

  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    tester = await PublicTxSimulationTester.create();
  });

  it('amm operations', async () => {
    await ammTest(tester, logger, TokenContractArtifact, AMMContractArtifact, (b: boolean) => expect(b).toBe(true));
  });
});
