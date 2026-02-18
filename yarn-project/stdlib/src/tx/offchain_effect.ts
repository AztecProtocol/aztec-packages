import { Fr } from '@aztec/foundation/curves/bn254';

import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { TxHash } from './tx_hash.js';

/**
 * Represents an offchain effect emitted via the `emit_offchain_effect` oracle (see the oracle documentation for
 * more details).
 */
export type OffchainEffect = {
  /** The emitted data */
  data: Fr[];
  /** The contract that emitted the data */
  contractAddress: AztecAddress;
};

/** An offchain message bundle, containing an offchain effect and the hash of the tx that produced it. */
export type OffchainMessage = {
  /** The offchain effect emitted during private execution. */
  offchainEffect: OffchainEffect;
  /** The hash of the transaction that emitted this effect. */
  txHash: TxHash;
};

/** Zod schema for {@link OffchainMessage} serialization. */
export const OffchainMessageSchema = z.object({
  offchainEffect: z.object({
    data: z.array(Fr.schema),
    contractAddress: AztecAddress.schema,
  }),
  txHash: TxHash.schema,
});
