import { createLogger } from '@aztec/foundation/log';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { bulkTest } from '../../fixtures/bulk_test.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe.each([
  { useCppSimulator: false, simulatorName: 'TS Simulator' },
  { useCppSimulator: true, simulatorName: 'Cpp Simulator' },
])('Public TX simulator apps tests: AvmTestContract ($simulatorName)', ({ useCppSimulator }) => {
  const logger = createLogger('avm-test-contract-tests');

  let worldStateService: NativeWorldStateService;
  let simTester: PublicTxSimulationTester;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    simTester = await PublicTxSimulationTester.create(
      worldStateService,
      /*globals=*/ undefined,
      /*metrics=*/ undefined,
      useCppSimulator,
    );
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  it('bulk testing', async () => {
    const result = await bulkTest(simTester, logger, AvmTestContractArtifact);
    expect(result.revertCode.isOK()).toBe(true);
  });
});
