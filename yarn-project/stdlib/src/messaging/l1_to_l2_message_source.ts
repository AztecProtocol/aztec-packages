import type { CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';

import type { L2Tips } from '../block/l2_block_source.js';

/**
 * Interface of classes allowing for the retrieval of L1 to L2 messages.
 */
export interface L1ToL2MessageSource {
  /**
   * Gets new L1 to L2 message (to be) included in a given checkpoint.
   * @param checkpointNumber - Checkpoint number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree (throws if not found).
   */
  getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]>;

  /**
   * Gets the L1 to L2 message index in the L1 to L2 message tree.
   * @param l1ToL2Message - The L1 to L2 message.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined>;

  /**
   * Returns the tips of the L2 chain.
   */
  getL2Tips(): Promise<L2Tips>;
}
