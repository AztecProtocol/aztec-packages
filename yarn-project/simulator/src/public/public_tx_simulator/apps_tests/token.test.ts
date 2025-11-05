import { createLogger } from '@aztec/foundation/log';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';
import { tokenTest } from '../../fixtures/token_test.js';

describe.each([
  { useCppSimulator: false, simulatorName: 'TS Simulator' },
  { useCppSimulator: true, simulatorName: 'Cpp Simulator' },
])('Public TX simulator apps tests: TokenContract ($simulatorName)', ({ useCppSimulator }) => {
  const logger = createLogger('public-tx-apps-tests-token');

  let worldStateService: NativeWorldStateService;
  let tester: PublicTxSimulationTester;

  beforeAll(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await PublicTxSimulationTester.create(
      worldStateService,
      /*globals=*/ undefined,
      /*metrics=*/ undefined,
      useCppSimulator,
    );
  });

  afterAll(async () => {
    await worldStateService.close();
  });

  it('token constructor, mint, transfer, burn, check balances)', async () => {
    await tokenTest(tester, logger, TokenContractArtifact, (b: boolean) => expect(b).toBe(true));
  });
});
