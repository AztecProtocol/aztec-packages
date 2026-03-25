import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { MessageContext } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

/** Resolves transaction hashes into the context needed to process messages. */
export class MessageContextService {
  constructor(private readonly aztecNode: AztecNode) {}

  /**
   * Resolves a list of tx hashes into their message contexts.
   *
   * For each tx hash, looks up the corresponding tx effect and extracts the note hashes and first nullifier needed to
   * process messages that originated from that transaction. Returns `null` for tx hashes that are zero, not yet
   * available, or in blocks beyond the anchor block.
   */
  resolveMessageContexts(txHashes: Fr[], anchorBlockNumber: number): Promise<(MessageContext | null)[]> {
    // TODO: optimize, we might be hitting the node to get the same txHash repeatedly
    return Promise.all(
      txHashes.map(async txHashField => {
        // A zero tx hash indicates a tx-less offchain message (e.g. one not tied to any onchain transaction).
        // These messages don't have a transaction context to resolve, so we return null.
        if (txHashField.isZero()) {
          return null;
        }

        const txHash = TxHash.fromField(txHashField);
        const txEffect = await this.aztecNode.getTxEffect(txHash);
        if (!txEffect || txEffect.l2BlockNumber > anchorBlockNumber) {
          return null;
        }

        // Every tx has at least one nullifier (the first nullifier derived from the tx hash). Hitting this condition
        // would mean a buggy node, but since we need to access data.nullifiers[0], the defensive check does no harm.
        const data = txEffect.data;
        if (data.nullifiers.length === 0) {
          throw new Error(`Tx effect for ${txHash} has no nullifiers`);
        }

        return new MessageContext(data.txHash, data.noteHashes, data.nullifiers[0]);
      }),
    );
  }
}
