import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { TxHash } from '@aztec/stdlib/tx';

import { MessageTxContext } from '../contract_function_simulator/noir-structs/message_tx_context.js';

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
  resolveMessageContexts(txHashes: Fr[], anchorBlockNumber: number): Promise<(MessageTxContext | null)[]> {
    // TODO: optimize, we might be hitting the node to get the same txHash repeatedly
    return Promise.all(
      txHashes.map(async txHashField => {
        if (txHashField.isZero()) {
          return null;
        }

        const txHash = TxHash.fromField(txHashField);
        const txEffect = await this.aztecNode.getTxEffect(txHash);
        if (!txEffect || txEffect.l2BlockNumber > anchorBlockNumber) {
          return null;
        }

        const data = txEffect.data;
        if (data.nullifiers.length === 0) {
          return null;
        }

        return new MessageTxContext(data.txHash, data.noteHashes, data.nullifiers[0]);
      }),
    );
  }
}
