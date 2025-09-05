import { createLogger } from '@aztec/foundation/log';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';

import { bulkTest } from '../../fixtures/bulk_test.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: AvmTestContract', () => {
  const logger = createLogger('avm-test-contract-tests');
  let simTester: PublicTxSimulationTester;

  beforeEach(async () => {
    simTester = await PublicTxSimulationTester.create();
  });

  it('bulk testing', async () => {
    const result = await bulkTest(simTester, logger, AvmTestContractArtifact);
    expect(result.revertCode.isOK()).toBe(true);
  });
});
