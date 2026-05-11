import { readTestData, writeTestData } from '@aztec/foundation/testing/files';
import { AvmCircuitInputs, PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { executeAvmMinimalPublicTx } from '../../fixtures/minimal_public_tx.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: AvmMinimalTestContract', () => {
  let worldStateService: NativeWorldStateService;
  let tester: PublicTxSimulationTester;
  // Make sure we collect hints
  const config: PublicSimulatorConfig = PublicSimulatorConfig.from({
    skipFeeEnforcement: false,
    collectCallMetadata: true,
    collectDebugLogs: false,
    collectHints: true,
    collectPublicInputs: true,
    collectStatistics: false,
  });

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await PublicTxSimulationTester.create(
      worldStateService,
      /*globals=*/ undefined,
      /*metrics=*/ undefined,
      config,
    );
  });

  afterEach(async () => {
    await tester.close();
    await worldStateService.close();
  });

  // This test makes sure that any TS changes are propagated to the testdata,
  // which is used by the C++ tests. If AvmCircuitInputs or generated hints
  // meaningfully change, this test will fail and the developer must regenerate
  // the test data with AZTEC_GENERATE_TEST_DATA=1.
  it('Minimal TX avm inputs serialized for cpp tests', async () => {
    const result = await executeAvmMinimalPublicTx(tester);
    expect(result.revertCode.isOK()).toBe(true);
    const buffer = new AvmCircuitInputs(result.hints!, result.publicInputs!).serializeWithMessagePack();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update test data
    const path = 'barretenberg/cpp/src/barretenberg/vm2/testing/minimal_tx.testdata.bin';
    writeTestData(path, buffer, /*raw=*/ true);

    const expected = readTestData(path);
    // Note: we use .equals() here to prevent jest from taking forever to
    // generate the diff. This could otherwise take 10m+ and kill CI.
    expect(buffer.equals(expected)).toBe(true);
  });
});
