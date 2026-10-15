import { Schnorr } from '@aztec/foundation/crypto/schnorr';
import { Fq, Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import {
  INTERACTIVE_HANDSHAKE_REQUEST_KIND,
  STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
  STANDARD_HANDSHAKE_REGISTRY_CLASS_ID,
} from '@aztec/standard-contracts/handshake-registry/constants';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { PublicKeys } from '@aztec/stdlib/keys';

import {
  type InteractiveHandshakeCustomRequest,
  InteractiveHandshakeCustomRequestSchema,
  type RecipientSignature,
  RecipientSignatureSchema,
  parseInteractiveHandshakeRequest,
  recipientSignatureToFields,
} from './wire.js';

function makeRequest(overrides: Partial<InteractiveHandshakeCustomRequest> = {}): InteractiveHandshakeCustomRequest {
  return {
    contractAddress: STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
    contractClassId: STANDARD_HANDSHAKE_REGISTRY_CLASS_ID,
    kind: INTERACTIVE_HANDSHAKE_REQUEST_KIND,
    payload: [Fr.random(), Fr.random(), Fr.random(), Fr.random()],
    ...overrides,
  };
}

async function makeRecipientSignature(): Promise<RecipientSignature> {
  return {
    publicKeys: await PublicKeys.random(),
    partialAddress: Fr.random(),
    mspkX: Fr.random(),
    mspkYIsPositive: true,
    signature: await new Schnorr().constructSignature(Fr.random(), GrumpkinScalar.random()),
  };
}

describe('parseInteractiveHandshakeRequest', () => {
  it('parses a valid request', () => {
    const request = makeRequest();
    const parsed = parseInteractiveHandshakeRequest(request);
    expect(parsed.recipient).toEqual(new AztecAddress(request.payload[0]));
    expect(parsed.chainId).toEqual(request.payload[1]);
    expect(parsed.version).toEqual(request.payload[2]);
    expect(parsed.ephPkX).toEqual(request.payload[3]);
  });

  it('rejects an unexpected kind', () => {
    expect(() => parseInteractiveHandshakeRequest(makeRequest({ kind: Fr.random() }))).toThrow('unexpected kind');
  });

  it('rejects a request issued by another contract address', async () => {
    const otherContract = await AztecAddress.random();
    expect(() => parseInteractiveHandshakeRequest(makeRequest({ contractAddress: otherContract }))).toThrow(
      'expected the standard HandshakeRegistry at',
    );
  });

  it('rejects a request issued by another contract class', () => {
    expect(() => parseInteractiveHandshakeRequest(makeRequest({ contractClassId: Fr.random() }))).toThrow(
      'expected the standard HandshakeRegistry class',
    );
  });

  it('rejects a payload of the wrong shape', () => {
    expect(() => parseInteractiveHandshakeRequest(makeRequest({ payload: [Fr.random()] }))).toThrow('expected 4');
  });
});

describe('wire schemas', () => {
  it('round-trips a request through JSON', () => {
    const request = makeRequest();
    const roundTripped = jsonParseWithSchema(jsonStringify(request), InteractiveHandshakeCustomRequestSchema);
    expect(roundTripped).toEqual(request);
  });

  it('round-trips a recipient signature through JSON', async () => {
    const recipientSignature = await makeRecipientSignature();
    const roundTripped = jsonParseWithSchema(jsonStringify(recipientSignature), RecipientSignatureSchema);
    expect(roundTripped).toEqual(recipientSignature);
  });
});

describe('recipientSignatureToFields', () => {
  it('pins the field layout the registry circuit deserializes', async () => {
    const recipientSignature = await makeRecipientSignature();
    const fields = recipientSignatureToFields(recipientSignature);

    const publicKeysFields = recipientSignature.publicKeys.toFields();
    expect(fields).toHaveLength(publicKeysFields.length + 7);
    expect(fields.slice(0, publicKeysFields.length)).toEqual(publicKeysFields);
    expect(fields[publicKeysFields.length]).toEqual(recipientSignature.partialAddress);
    expect(fields[publicKeysFields.length + 1]).toEqual(recipientSignature.mspkX);
    expect(fields[publicKeysFields.length + 2]).toEqual(new Fr(1));

    const s = Fq.fromBuffer(recipientSignature.signature.s);
    const e = Fq.fromBuffer(recipientSignature.signature.e);
    expect(fields.slice(publicKeysFields.length + 3)).toEqual([s.lo, s.hi, e.lo, e.hi]);
  });
});
