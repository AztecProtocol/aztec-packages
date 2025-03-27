import { randomInt } from '@aztec/foundation/crypto';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { readTestData, writeTestData } from '@aztec/foundation/testing/files';

import cloneDeep from 'lodash.clonedeep';

import { makeAvmCircuitInputs } from '../tests/factories.js';
import { AvmCircuitInputs } from './avm.js';

describe('Avm circuit inputs', () => {
  // This tests that serde with the orchestrator works.
  it(`serializes to JSON and deserializes it back`, async () => {
    const avmCircuitInputs = await makeAvmCircuitInputs(randomInt(2000));
    const json = jsonStringify(avmCircuitInputs);
    const res = await jsonParseWithSchema(json, AvmCircuitInputs.schema);
    expect(res).toEqual(avmCircuitInputs);
  });

  it('serialization sample for avm2', async () => {
    const inputs = await makeAvmCircuitInputs(/*seed=*/ 0x1234);

    // We force duplication of some items to test deduplication.
    // We clone to make sure that the deduplication is not just by reference.
    inputs.hints.enqueuedCalls.push(cloneDeep(inputs.hints.enqueuedCalls[0]));
    inputs.hints.contractInstances.push(cloneDeep(inputs.hints.contractInstances[0]));
    inputs.hints.contractClasses.push(cloneDeep(inputs.hints.contractClasses[0]));
    inputs.hints.bytecodeCommitments.push(cloneDeep(inputs.hints.bytecodeCommitments[0]));
    inputs.hints.getSiblingPathHints.push(cloneDeep(inputs.hints.getSiblingPathHints[0]));
    inputs.hints.getPreviousValueIndexHints.push(cloneDeep(inputs.hints.getPreviousValueIndexHints[0]));
    inputs.hints.getLeafPreimageHintsPublicDataTree.push(cloneDeep(inputs.hints.getLeafPreimageHintsPublicDataTree[0]));

    const buffer = inputs.serializeWithMessagePack();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update test data
    const path = 'barretenberg/cpp/src/barretenberg/vm2/common/avm_inputs.testdata.bin';
    writeTestData(path, buffer, /*raw=*/ true);

    const expected = readTestData(path);
    expect(buffer).toEqual(expected);
  });
});
