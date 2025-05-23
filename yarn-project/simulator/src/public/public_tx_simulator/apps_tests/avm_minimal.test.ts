import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { readTestData, writeTestData } from '@aztec/foundation/testing/files';
import { AvmCircuitInputs } from '@aztec/stdlib/avm';

import { createAvmMinimalPublicTx, readAvmMinimalPublicTxInputsFromFile } from '../../fixtures/minimal_public_tx.js';

describe('Public TX simulator apps tests: AvmMinimalTestContract', () => {
  it('Minimal Tx avm inputs snapshot stored in Json file', async () => {
    const result = await createAvmMinimalPublicTx();
    expect(result.revertCode.isOK()).toBe(true);
    const inputs = result.avmProvingRequest.inputs;
    const json = jsonStringify(inputs);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update test data
    const path = 'yarn-project/simulator/artifacts/avm_minimal_inputs.json';
    writeTestData(path, Buffer.from(json), /*raw=*/ true);

    const expectedJson = readTestData(path);
    const expectedAvmInputs = await jsonParseWithSchema(expectedJson.toString(), AvmCircuitInputs.schema);
    expect(expectedAvmInputs).toStrictEqual(inputs);
  });

  it('Minimal Tx avm inputs snapshot loaded from json file', async () => {
    // If the test data needs to be updated, run the above ^ test case
    // with AZTEC_GENERATE_TEST_DATA=1, and _then_ rerun this test and it should pass.
    const result = await createAvmMinimalPublicTx();
    const inputs = result.avmProvingRequest.inputs;
    const avmInputsFromFile = readAvmMinimalPublicTxInputsFromFile();
    expect(inputs).toStrictEqual(avmInputsFromFile);
  });
});
