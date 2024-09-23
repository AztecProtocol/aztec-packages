import { EpochProofQuote, EpochProofQuotePayload } from '@aztec/circuit-types';
import { EthAddress } from '@aztec/circuits.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer } from '@aztec/foundation/crypto';

import { type ProofQuoteGovernor } from './proof-quote-governor.js';

export class SimpleProofQuoteGovernor implements ProofQuoteGovernor {
  static bondAmount = 10000000n;
  private constructor(private readonly signer: Secp256k1Signer) {}

  static async new(config: { publisherPrivateKey: `0x${string}` }) {
    const privateKey = Buffer32.fromString(config.publisherPrivateKey);
    const governor = new SimpleProofQuoteGovernor(new Secp256k1Signer(privateKey));
    await governor.ensureBond(SimpleProofQuoteGovernor.bondAmount);
    return governor;
  }

  get signerAddress(): EthAddress {
    return this.signer.address;
  }

  ensureBond(_amount: bigint): Promise<void> {
    return Promise.resolve();
  }

  produceEpochProofQuote(epoch: bigint): Promise<EpochProofQuote | undefined> {
    return Promise.resolve(
      EpochProofQuote.new(
        // TODO: configure these from the config
        EpochProofQuotePayload.fromFields({
          basisPointFee: 1000,
          bondAmount: 10000000n,
          epochToProve: epoch,
          rollupAddress: EthAddress.ZERO,
          validUntilSlot: 100n,
        }),
        this.signer,
      ),
    );
  }
}
