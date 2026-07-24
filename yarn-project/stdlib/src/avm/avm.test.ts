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

describe('PublicTxResult totalInstructionsExecuted', () => {
  // Round-trips an empty result through the schema, overriding (or omitting) totalInstructionsExecuted.
  const parseWith = (value: number | null | undefined) => {
    const plain = JSON.parse(jsonStringify(PublicTxResult.empty()));
    if (value === undefined) {
      delete plain.totalInstructionsExecuted;
    } else {
      plain.totalInstructionsExecuted = value;
    }
    return jsonParseWithSchema(JSON.stringify(plain), PublicTxResult.schema);
  };

  it('round-trips a concrete value through the schema', () => {
    expect(parseWith(4242).totalInstructionsExecuted).toBe(4242);
  });

  it('defaults to 0 when missing (e.g. an older serialized result)', () => {
    expect(parseWith(undefined).totalInstructionsExecuted).toBe(0);
  });

  it('defaults to 0 when null', () => {
    expect(parseWith(null).totalInstructionsExecuted).toBe(0);
  });

  // Production deserialization of C++ output goes through fromPlainObject, not the schema, so pin its
  // fallback too. This is a minimal well-formed stand-in for the MessagePack-decoded C++ result:
  // Fr/RevertCode plain values are bare numbers and the optional proving fields (logs/hints/publicInputs)
  // are omitted. We vary only totalInstructionsExecuted.
  it('fromPlainObject reads totalInstructionsExecuted, defaulting to 0 when missing/null', () => {
    const gas = { l2Gas: 0, daGas: 0 };
    const base = {
      gasUsed: { totalGas: gas, publicGas: gas, teardownGas: gas, billedGas: gas },
      revertCode: 0,
      publicTxEffect: {
        transactionFee: 0,
        noteHashes: [],
        nullifiers: [],
        l2ToL1Msgs: [],
        publicLogs: [],
        publicDataWrites: [],
      },
      callStackMetadata: [],
    };

    expect(PublicTxResult.fromPlainObject({ ...base, totalInstructionsExecuted: 99 }).totalInstructionsExecuted).toBe(
      99,
    );
    expect(PublicTxResult.fromPlainObject(base).totalInstructionsExecuted).toBe(0);
    expect(PublicTxResult.fromPlainObject({ ...base, totalInstructionsExecuted: null }).totalInstructionsExecuted).toBe(
      0,
    );
  });
});
