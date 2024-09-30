import { EthAddress } from '@aztec/circuits.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer, keccak256 } from '@aztec/foundation/crypto';

import { get712StructuredDigest, getHashedSignaturePayload } from '../p2p/signature_utils.js';
import { EpochProofQuote } from './epoch_proof_quote.js';
import { EpochProofQuotePayload } from './epoch_proof_quote_payload.js';

describe('epoch proof quote', () => {
  it('should serialize / deserialize', () => {
    const signer = Secp256k1Signer.random();
    const payload = EpochProofQuotePayload.fromFields({
      basisPointFee: 5000,
      bondAmount: 1000000000000000000n,
      epochToProve: 42n,
      prover: EthAddress.random(),
      validUntilSlot: 100n,
      domainSeparator: Buffer32.random(),
    });

    const quote = EpochProofQuote.new(payload, signer);
    expect(EpochProofQuote.fromBuffer(quote.toBuffer())).toEqual(quote);
    expect(quote.senderAddress).toEqual(signer.address);
  });

  it('should be able to use eip 712', () => {
    const payload = EpochProofQuotePayload.fromFields({
      epochToProve: 42n,
      validUntilSlot: 100n,
      bondAmount: 1000000000000000000n,
      prover: EthAddress.fromString('0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826'),
      basisPointFee: 5000,
      domainSeparator: Buffer32.random(),
    });

    const hash = getHashedSignaturePayload(payload).to0xString();
    expect(hash).toEqual('0x4ed9cc91360dbd11218c8fcf4e8402f7a85d298dd4b4fb3d1fbcbb1a8ae72cc9');

    const digest = get712StructuredDigest(payload).to0xString();
    expect(digest).toEqual('0x6927eba5b70276d7a9ccedac195c01844c8e71b3fdf9f8a5972914e8a2d5911d');

    const signer = new Secp256k1Signer(Buffer32.fromBuffer(keccak256(Buffer.from('cow'))));
    const quote = EpochProofQuote.new(payload, signer);
    expect(quote.senderAddress.toString().toLowerCase()).toEqual('0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826');
  });
});
