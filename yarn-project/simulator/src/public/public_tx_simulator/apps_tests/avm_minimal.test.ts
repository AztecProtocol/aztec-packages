import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { readTestData, writeTestData } from '@aztec/foundation/testing/files';
import { AvmCircuitInputs } from '@aztec/stdlib/avm';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { executeAvmMinimalPublicTx, readAvmMinimalPublicTxInputsFromFile } from '../../fixtures/minimal_public_tx.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe.each([
  { useCppSimulator: false, simulatorName: 'TS Simulator' },
  { useCppSimulator: true, simulatorName: 'Cpp Simulator' },
])('Public TX simulator apps tests: AvmMinimalTestContract ($simulatorName)', ({ useCppSimulator }) => {
  let worldStateService: NativeWorldStateService;
  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await PublicTxSimulationTester.create(
      worldStateService,
      /*globals=*/ undefined,
      /*metrics=*/ undefined,
      useCppSimulator,
    );
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  it('Minimal Tx avm inputs snapshot stored in Json file', async () => {
    const result = await executeAvmMinimalPublicTx(tester);
    expect(result.revertCode.isOK()).toBe(true);
    const inputs = new AvmCircuitInputs(result.hints!, result.publicInputs);
    const json = jsonStringify(inputs);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update test data
    const path = 'yarn-project/simulator/artifacts/avm_minimal_inputs.json';
    writeTestData(path, Buffer.from(json), /*raw=*/ true);

    const expectedJson = readTestData(path);
    const expectedAvmInputs = jsonParseWithSchema(expectedJson.toString(), AvmCircuitInputs.schema);
    expect(expectedAvmInputs).toStrictEqual(inputs);
  });

  it('Minimal Tx avm inputs snapshot loaded from json file', async () => {
    // If the test data needs to be updated, run the above ^ test case
    // with AZTEC_GENERATE_TEST_DATA=1, and _then_ rerun this test and it should pass.
    const result = await executeAvmMinimalPublicTx(tester);
    const inputs = new AvmCircuitInputs(result.hints!, result.publicInputs);
    const avmInputsFromFile = readAvmMinimalPublicTxInputsFromFile();
    expect(inputs).toStrictEqual(avmInputsFromFile);
  });

  // This test makes sure that any TS changes are propagated to the testdata,
  // which is used by the C++ tests.
  it('Minimal TX avm inputs serialized for cpp tests', async () => {
    const result = await executeAvmMinimalPublicTx(tester);
    const buffer = new AvmCircuitInputs(result.hints!, result.publicInputs).serializeWithMessagePack();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update test data
    const path = 'barretenberg/cpp/src/barretenberg/vm2/testing/minimal_tx.testdata.bin';
    writeTestData(path, buffer, /*raw=*/ true);

    const expected = readTestData(path);
    // Note: we use .equals() here to prevent jest from taking forever to
    // generate the diff. This could otherwise take 10m+ and kill CI.
    expect(buffer.equals(expected)).toBe(true);
  });
});
