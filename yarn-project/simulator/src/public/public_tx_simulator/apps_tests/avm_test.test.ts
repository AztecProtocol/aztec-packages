import { createLogger } from '@aztec/foundation/log';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { bulkTest } from '../../fixtures/bulk_test.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: AvmTestContract', () => {
  const logger = createLogger('avm-test-contract-tests');

  let worldStateService: NativeWorldStateService;
  let simTester: PublicTxSimulationTester;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    simTester = await PublicTxSimulationTester.create(worldStateService);
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  it('bulk testing', async () => {
    const result = await bulkTest(simTester, logger, AvmTestContractArtifact);
    expect(result.revertCode.isOK()).toBe(true);
  });
});
