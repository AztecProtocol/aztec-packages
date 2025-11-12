import { randomInt } from '@aztec/foundation/crypto';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { getPathToFile, readTestData, writeTestData } from '@aztec/foundation/testing/files';
import { Timer } from '@aztec/foundation/timer';

import { readdirSync } from 'node:fs';

import { makeAvmCircuitInputs } from '../tests/factories.js';
import { AvmCircuitInputs, PublicTxResult } from './avm.js';
import { deserializeFromMessagePack } from './message_pack.js';

describe('Avm circuit inputs', () => {
  // This tests that serde with the orchestrator works.
  it(`serializes to JSON and deserializes it back`, async () => {
    const avmCircuitInputs = await makeAvmCircuitInputs(randomInt(2000));
    const json = jsonStringify(avmCircuitInputs);
    const res = jsonParseWithSchema(json, AvmCircuitInputs.schema);
    // Note: using toEqual instead of toStrictEqual to match other serialization tests in the codebase.
    // toEqual checks deep value equality, while toStrictEqual also checks prototypes and property
    // descriptors, which can differ for schema-reconstructed objects even when data is identical.
    expect(res).toEqual(avmCircuitInputs);
  });

  // This test makes sure that any TS changes are propagated to the testdata,
  // which is used by the C++ tests.
  it('serialization sample for avm2', async () => {
    const inputs = await makeAvmCircuitInputs(/*seed=*/ 0x1234);
    const buffer = inputs.serializeWithMessagePack();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update test data
    const path = 'barretenberg/cpp/src/barretenberg/vm2/testing/avm_inputs.testdata.bin';
    writeTestData(path, buffer, /*raw=*/ true);

    const expected = readTestData(path);
    // Note: we use .equals() here to prevent jest from taking forever to
    // generate the diff. This could otherwise take 10m+ and kill CI.
    expect(buffer.equals(expected)).toBe(true);
  });

  // This test is only useful to benchmark the performance of the deserialization locally.
  // To generate the inputs run the public_tx_simulator/apps_tests with AZTEC_WRITE_TESTDATA=1.
  it.skip('deserializes a PublicTxResult from C++', () => {
    const logger = createLogger('test:stdlib:avm');
    // For each tx result in the testdata directory, deserialize it and check that it parses correctly.
    const testdataDir = 'barretenberg/cpp/src/barretenberg/vm2/testing';
    const files = readdirSync(getPathToFile(testdataDir))
      .filter(file => file.startsWith('tx_result_'))
      .map(file => `${testdataDir}/${file}`);
    for (const file of files) {
      const buffer = readTestData(file);
      const timerMP = new Timer();
      const json = deserializeFromMessagePack(buffer);
      logger.info(`Deserialized ${file} in ${timerMP.ms()}ms (MessagePack)`);
      const timerManual = new Timer();
      PublicTxResult.fromPlainObject(json);
      logger.info(`Deserialized ${file} in ${timerManual.ms()}ms (manual)`);
    }
  });
});
