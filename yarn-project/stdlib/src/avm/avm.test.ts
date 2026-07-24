import { randomInt } from '@aztec/foundation/crypto/random';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import { makeAvmCircuitInputs } from '../tests/factories.js';
import { AvmCircuitInputs } from './avm.js';
import { deserializeFromMessagePack } from './message_pack.js';

describe('Avm circuit inputs', () => {
  // This tests that serde with the orchestrator works. Used in the JSON-RPC API.
  it(`serializes to JSON and deserializes it back`, async () => {
    const avmCircuitInputs = await makeAvmCircuitInputs(randomInt(2000));
    const json = jsonStringify(avmCircuitInputs);
    const res = jsonParseWithSchema(json, AvmCircuitInputs.schema);
    // Note: using toEqual instead of toStrictEqual to match other serialization tests in the codebase.
    // toEqual checks deep value equality, while toStrictEqual also checks prototypes and property
    // descriptors, which can differ for schema-reconstructed objects even when data is identical.
    expect(res).toEqual(avmCircuitInputs);
  });

  // This is a minimal requirement. It only tests that the MP serialization from TS
  // works, but it doesn't say much about the C++ MP serialization.
  // That is exercised in the simulator tests.
  it('serializes with MessagePack and deserializes it back', async () => {
    const avmCircuitInputs = await makeAvmCircuitInputs(/*seed=*/ 0x1234);
    const buffer = avmCircuitInputs.serializeWithMessagePack();
    const json = deserializeFromMessagePack(buffer);
    const res = AvmCircuitInputs.fromPlainObject(json);
    expect(res).toEqual(avmCircuitInputs);
  });
});
