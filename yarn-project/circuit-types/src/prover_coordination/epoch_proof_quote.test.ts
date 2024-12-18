import { EthAddress } from '@aztec/circuits.js';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import { getHashedSignaturePayloadEthSignedMessage } from '../p2p/signature_utils.js';
import { EpochProofQuote } from './epoch_proof_quote.js';
import { EpochProofQuoteHasher } from './epoch_proof_quote_hasher.js';
import { EpochProofQuotePayload } from './epoch_proof_quote_payload.js';

describe('epoch proof quote', () => {
  let quote: EpochProofQuote;
  let signer: Secp256k1Signer;
  let hasher: EpochProofQuoteHasher;

  beforeEach(() => {
    signer = Secp256k1Signer.random();

    const payload = EpochProofQuotePayload.from({
      basisPointFee: 5000,
      bondAmount: 1000000000000000000n,
      epochToProve: 42n,
      prover: EthAddress.random(),
      validUntilSlot: 100n,
    });

    hasher = new EpochProofQuoteHasher(EthAddress.random(), 1);

    const digest = hasher.hash(payload);
    const signature = signer.sign(digest);
    quote = new EpochProofQuote(payload, signature);
  });

  const checkEquivalence = (serialized: EpochProofQuote, deserialized: EpochProofQuote) => {
    expect(deserialized.getSize()).toEqual(serialized.getSize());
    expect(deserialized).toEqual(serialized);
  };

  it('should serialize and deserialize from buffer', () => {
    const deserialised = EpochProofQuote.fromBuffer(quote.toBuffer());
    checkEquivalence(quote, deserialised);

    // Recover the signer
    const recovered = deserialised.getSender(hasher);
    expect(recovered).toEqual(signer.address);
  });

  it('should serialize and deserialize from JSON', () => {
    const deserialised = jsonParseWithSchema(jsonStringify(quote), EpochProofQuote.schema);
    checkEquivalence(quote, deserialised);
  });
});
