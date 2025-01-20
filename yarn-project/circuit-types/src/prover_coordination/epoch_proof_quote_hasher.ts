import { RollupAbi } from '@aztec/ethereum/contracts';
import { Buffer32 } from '@aztec/foundation/buffer';

import { getAbiItem, hashTypedData, keccak256, parseAbiParameters } from 'viem';

import { type EpochProofQuotePayload, type EthAddress } from './epoch_proof_quote_payload.js';

type EpochProofQuoteTypeHash = {
  EpochProofQuote: {
    name: string;
    type: string;
  }[];
};

/**
 * Constructs the type hash for the EpochProofQuote struct.
 *
 * Given an abi type like so {
 *  EpochProofQuote: {
 *    name: 'epochToProve',
 *    type: 'uint256',
 *  }
 * }
 *
 * it would construct the hash of the following string:
 * E.g: EpochProofQuote(uint256 epochToProve)
 *
 * @param types - The types of the EpochProofQuote struct
 */
function constructTypeHash(types: EpochProofQuoteTypeHash): `0x${string}` {
  const paramsString = types.EpochProofQuote.map(({ name, type }) => `${type} ${name}`).join(',');
  const typeString = `EpochProofQuote(${paramsString})`;
  return keccak256(Buffer.from(typeString));
}

/**
 * Constructs the abi for the quoteToDigest function.
 *
 * Given an abi type like so {
 *  EpochProofQuote: {
 *    name: 'epochToProve',
 *    type: 'uint256',
 *  }
 * }
 *
 * it would construct the abi of the following string:
 *     [name (EpochProofQuote), ...params]
 * E.g: bytes32, uint256 epochToProve
 *
 * @param types - The types of the EpochProofQuote struct
 */
function constructHasherAbi(types: EpochProofQuoteTypeHash) {
  return parseAbiParameters(`bytes32, ${types.EpochProofQuote.map(({ name, type }) => `${type} ${name}`).join(',')}`);
}

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

  /**
   * Reads the abi of the quoteToDigest function from the rollup contract and extracts the types
   * of the EpochProofQuote struct.
   * function quoteToDigest(EpochProofQuote quote)
   *
   * This avoids re-declaring the types and values here that could go out of sync with
   * the rollup contract
   */
  static readonly types: EpochProofQuoteTypeHash = {
    EpochProofQuote: getAbiItem({ abi: RollupAbi, name: 'quoteToDigest' }).inputs[0].components.map(component => ({
      name: component.name,
      type: component.type,
    })),
  };

  // Type hash for the types defined in the types object
  static readonly EPOCH_PROOF_QUOTE_TYPE_HASH = constructTypeHash(EpochProofQuoteHasher.types);

  // Viem abi object for the types defined in the types object
  static readonly HASHER_ABI = constructHasherAbi(EpochProofQuoteHasher.types);

  constructor(rollupAddress: EthAddress, version: number, chainId: number) {
    this.domain = {
      name: 'Aztec Rollup',
      version: version.toString(),
      chainId,
      verifyingContract: rollupAddress.toString(),
    };
  }

  hash(payload: EpochProofQuotePayload): Buffer32 {
    return Buffer32.fromString(
      hashTypedData({
        domain: this.domain,
        types: EpochProofQuoteHasher.types,
        primaryType: 'EpochProofQuote',
        message: payload.toViemArgs(),
      }),
    );
  }
}
