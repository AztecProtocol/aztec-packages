import { L2BlockL2Logs, TxEffect } from '@aztec/circuit-types';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { sha256 } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

export class Body {
  constructor(
    public l1ToL2Messages: Tuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>,
    public txEffects: TxEffect[],
  ) {}

  /**
   * Serializes a block body
   * @returns A serialized L2 block body.
   */
  toBuffer() {
    return serializeToBuffer(this.l1ToL2Messages.length, this.l1ToL2Messages, this.txEffects.length, this.txEffects);
  }

  /**
   * Deserializes a block from a buffer
   * @returns A deserialized L2 block.
   */
  static fromBuffer(buf: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buf);
    const l1ToL2Messages = reader.readVector(Fr);

    return new this(
      padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP),
      reader.readVector(TxEffect),
    );
  }

  [inspect.custom]() {
    // print non empty l2ToL1Messages and txEffects
    const l1ToL2Messages = this.l1ToL2Messages.filter(h => !h.isZero());

    return `Body {
  l1ToL2Messages: ${inspect(l1ToL2Messages)},
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

          layer.push(sha256(Buffer.concat([left, right])));
        }

        layers.push(layer);
        activeLayer++;
      }

      return layers[layers.length - 1][0];
    };

    const leafs: Buffer[] = this.txEffects.map(txEffect => txEffect.hash());

    return computeRoot(leafs);
  }

  get encryptedLogs(): L2BlockL2Logs {
    const logs = this.txEffects.map(txEffect => txEffect.encryptedLogs);

    return new L2BlockL2Logs(logs);
  }

  get unencryptedLogs(): L2BlockL2Logs {
    const logs = this.txEffects.map(txEffect => txEffect.unencryptedLogs);

    return new L2BlockL2Logs(logs);
  }

  get numberOfTxs() {
    // We gather all the txEffects that are not empty (the ones that have been padded by checking the first newNullifier of the txEffect);
    return this.txEffects.reduce((acc, txEffect) => (!txEffect.nullifiers[0].equals(Fr.ZERO) ? acc + 1 : acc), 0);
  }

  static random(
    txsPerBlock = 4,
    numPrivateCallsPerTx = 2,
    numPublicCallsPerTx = 3,
    numEncryptedLogsPerCall = 2,
    numUnencryptedLogsPerCall = 1,
    numL1ToL2MessagesPerCall = 2,
  ) {
    const newL1ToL2Messages = makeTuple(numL1ToL2MessagesPerCall, Fr.random);
    const txEffects = [...new Array(txsPerBlock)].map(_ =>
      TxEffect.random(numPrivateCallsPerTx, numPublicCallsPerTx, numEncryptedLogsPerCall, numUnencryptedLogsPerCall),
    );

    return new Body(padArrayEnd(newL1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP), txEffects);
  }
}
