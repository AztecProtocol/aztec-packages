import { EncryptedL2BlockL2Logs, TxEffect, UnencryptedL2BlockL2Logs } from '@aztec/circuit-types';
import { sha256 } from '@aztec/foundation/crypto';
import { BufferReader, serializeToBuffer, truncateAndPad } from '@aztec/foundation/serialize';

import { inspect } from 'util';

export class Body {
  constructor(public txEffects: TxEffect[]) {
    txEffects.forEach(txEffect => {
      if (txEffect.isEmpty()) {
        throw new Error('Empty tx effect not allowed in Body');
      }
    });
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
}`;
  }

  /**
   * Computes the transactions effects hash for the L2 block
   * This hash is also computed in the `AvailabilityOracle` and the `Circuit`.
   * @returns The txs effects hash.
   */
  getTxsEffectsHash() {
    const computeRoot = (leafs: Buffer[]): Buffer => {
      const layers: Buffer[][] = [leafs];
      let activeLayer = 0;

      while (layers[activeLayer].length > 1) {
        const layer: Buffer[] = [];
        const layerLength = layers[activeLayer].length;

        for (let i = 0; i < layerLength; i += 2) {
          const left = layers[activeLayer][i];
          const right = layers[activeLayer][i + 1];

          layer.push(truncateAndPad(sha256(Buffer.concat([left, right]))));
        }

        layers.push(layer);
        activeLayer++;
      }

      return layers[layers.length - 1][0];
    };

    // Copy of TxsDecoder.computeNumTxEffectsToPad
    const computeNumTxEffectsToPad = (numTxEffects: number) => {
      // 2 is the minimum number of tx effects so we have to handle the following 2 cases separately
      if (numTxEffects == 0) {
        return 2;
      } else if (numTxEffects == 1) {
        return 1;
      }

      let v: number = numTxEffects;

      // the following rounds numTxEffects up to the next power of 2 (works only for 4 bytes value!)
      v--;
      v |= v >> 1;
      v |= v >> 2;
      v |= v >> 4;
      v |= v >> 8;
      v |= v >> 16;
      v++;

      return v - numTxEffects;
    };

    const leafs: Buffer[] = this.txEffects.map(txEffect => txEffect.hash());
    const numLeafsToPad = computeNumTxEffectsToPad(this.txEffects.length);
    if (numLeafsToPad !== 0) {
      const emptyTxEffectHash = TxEffect.empty().hash();
      for (let i = 0; i < numLeafsToPad; i++) {
        leafs.push(emptyTxEffectHash);
      }
    }

    return computeRoot(leafs);
  }

  get encryptedLogs(): EncryptedL2BlockL2Logs {
    const logs = this.txEffects.map(txEffect => txEffect.encryptedLogs);

    return new EncryptedL2BlockL2Logs(logs);
  }

  get unencryptedLogs(): UnencryptedL2BlockL2Logs {
    const logs = this.txEffects.map(txEffect => txEffect.unencryptedLogs);

    return new UnencryptedL2BlockL2Logs(logs);
  }

  get numberOfTxs() {
    // TODO(benesjan): nuke this
    // We gather all the txEffects that are not empty (the ones that have been padded by checking the first newNullifier of the txEffect);
    return this.txEffects.reduce((acc, txEffect) => (txEffect.nullifiers.length !== 0 ? acc + 1 : acc), 0);
  }

  static random(
    txsPerBlock = 4,
    numPrivateCallsPerTx = 2,
    numPublicCallsPerTx = 3,
    numEncryptedLogsPerCall = 2,
    numUnencryptedLogsPerCall = 1,
  ) {
    const txEffects = [...new Array(txsPerBlock)].map(_ =>
      TxEffect.random(numPrivateCallsPerTx, numPublicCallsPerTx, numEncryptedLogsPerCall, numUnencryptedLogsPerCall),
    );

    return new Body(txEffects);
  }

  static empty() {
    return new Body([]);
  }
}
