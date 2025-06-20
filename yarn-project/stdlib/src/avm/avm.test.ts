import { randomInt } from '@aztec/foundation/crypto';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { readTestData, writeTestData } from '@aztec/foundation/testing/files';

import { makeAvmCircuitInputs } from '../tests/factories.js';
import { AvmCircuitInputs } from './avm.js';

describe('Avm circuit inputs', () => {
  // This tests that serde with the orchestrator works.
  it(`serializes to JSON and deserializes it back`, async () => {
    const avmCircuitInputs = await makeAvmCircuitInputs(randomInt(2000));
    const json = jsonStringify(avmCircuitInputs);
    const res = await jsonParseWithSchema(json, AvmCircuitInputs.schema);
    // Note: ideally we don't want to use toStrictEqual here (see other test),
    // but I couldn't find an equivalent equality check.
    expect(res).toStrictEqual(avmCircuitInputs);
  });

  // This test makes sure that any TS changes are propagated to the testdata,
  // which is used by the C++ tests.
  it('serialization sample for avm2', async () => {
    const inputs = await makeAvmCircuitInputs(/*seed=*/ 0x1234);
    const buffer = inputs.serializeWithMessagePack();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update test data
    const path = 'barretenberg/cpp/src/barretenberg/vm2/common/avm_inputs.testdata.bin';
    writeTestData(path, buffer, /*raw=*/ true);

    const expected = readTestData(path);
    // Note: we use .equals() here to prevent jest from taking forever to
    // generate the diff. This could otherwise take 10m+ and kill CI.
    expect(buffer.equals(expected)).toBe(true);
  });
});
