import { Buffer32 } from '@aztec/foundation/buffer';

import { hashTypedData } from 'viem';

import { EpochProofQuotePayload, EthAddress } from './epoch_proof_quote_payload.js';

/**
 * A utility class to hash EpochProofQuotePayloads following the EIP-712 standard.
 */
export class EpochProofQuoteHasher {
  // Domain information
  private readonly domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  private readonly types: {
    EpochProofQuote: {
      name: string;
      type: string;
    }[];
  };

  constructor(rollupAddress: EthAddress, chainId: number) {
    this.domain = {
      name: 'Aztec Rollup',
      version: '1',
      chainId,
      verifyingContract: rollupAddress.toString(),
    };
    this.types = {
      EpochProofQuote: [
        { name: 'epochToProve', type: 'uint256' },
        { name: 'validUntilSlot', type: 'uint256' },
        { name: 'bondAmount', type: 'uint256' },
        { name: 'prover', type: 'address' },
        { name: 'basisPointFee', type: 'uint32' },
      ],
    };
  }

  hash(payload: EpochProofQuotePayload): Buffer32 {
    return Buffer32.fromString(
      hashTypedData({
        domain: this.domain,
        types: this.types,
        primaryType: 'EpochProofQuote',
        message: payload.toViemArgs(),
      }),
    );
  }
}
