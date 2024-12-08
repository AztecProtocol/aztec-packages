import { type ZodFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { computeUnbalancedMerkleRoot } from '@aztec/foundation/trees';

import { inspect } from 'util';
import { z } from 'zod';

import { ContractClass2BlockL2Logs, UnencryptedL2BlockL2Logs } from './logs/index.js';
import { TxEffect } from './tx_effect.js';

export class Body {
  constructor(public txEffects: TxEffect[]) {
    txEffects.forEach(txEffect => {
      if (txEffect.isEmpty()) {
        throw new Error('Empty tx effect not allowed in Body');
      }
    });
  }

  static get schema(): ZodFor<Body> {
    return z
      .object({
        txEffects: z.array(TxEffect.schema),
      })
      .transform(({ txEffects }) => new Body(txEffects));
  }

  /**
   * Serializes a block body
   * @returns A serialized L2 block body.
   */
  toBuffer() {
    return serializeToBuffer(this.txEffects.length, this.txEffects);
  }

  /**
   * Deserializes a block from a buffer
   * @returns A deserialized L2 block.
   */
  static fromBuffer(buf: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buf);

    return new this(reader.readVector(TxEffect));
  }

  [inspect.custom]() {
    return `Body {
  txEffects: ${inspect(this.txEffects)},
  emptyTxEffectsCount: ${this.numberOfTxsIncludingPadded},
  emptyTxEffectHash: ${TxEffect.empty().hash().toString('hex')},
  txsEffectsHash: ${this.getTxsEffectsHash().toString('hex')},
}`;
  }

  /**
   * Computes the transactions effects hash for the L2 block
   * This hash is also computed in the `TxDecoder`.
   * @returns The txs effects hash.
   */
  getTxsEffectsHash() {
    const emptyTxEffectHash = TxEffect.empty().hash();
    const leaves: Buffer[] = this.txEffects.map(txEffect => txEffect.hash());
    return computeUnbalancedMerkleRoot(leaves, emptyTxEffectHash);
  }

  get unencryptedLogs(): UnencryptedL2BlockL2Logs {
    const logs = this.txEffects.map(txEffect => txEffect.unencryptedLogs);

    return new UnencryptedL2BlockL2Logs(logs);
  }

  get contractClassLogs(): ContractClass2BlockL2Logs {
    const logs = this.txEffects.map(txEffect => txEffect.contractClassLogs);

    return new ContractClass2BlockL2Logs(logs);
  }

  /**
   * Computes the number of transactions in the block including padding transactions.
   * @dev Modified code from TxsDecoder.computeNumTxEffectsToPad
   */
  get numberOfTxsIncludingPadded() {
    const numTxEffects = this.txEffects.length;

    // 2 is the minimum number of tx effects
    if (numTxEffects <= 2) {
      return 2;
    }

    return numTxEffects;
  }

  static random(txsPerBlock = 4, numPublicCallsPerTx = 3, numUnencryptedLogsPerCall = 1) {
    const txEffects = [...new Array(txsPerBlock)].map(_ =>
      TxEffect.random(numPublicCallsPerTx, numUnencryptedLogsPerCall),
    );

    return new Body(txEffects);
  }

  static empty() {
    return new Body([]);
  }
}
