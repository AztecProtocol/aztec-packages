import {
  L2BlockL2Logs,
  TxEffect,
} from '@aztec/circuit-types';
import { sha256 } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { serializeToBuffer } from '@aztec/foundation/serialize';

export class L2BlockBody {
  constructor(public l1ToL2Messages: Fr[], public txEffects: TxEffect[]) {}

  /**
   * Serializes a block body
   * @returns A serialized L2 block body.
   */
  toBuffer(includeLogs: boolean = false) {
    let logs: [L2BlockL2Logs, L2BlockL2Logs] | [] = [];

    if (includeLogs) {
      this.assertLogsAttached();

      const newEncryptedLogs = this.txEffects.flatMap(txEffect => txEffect.logs!.encryptedLogs);
      const newUnencryptedLogs = this.txEffects.flatMap(txEffect => txEffect.logs!.unencryptedLogs);
      logs = [new L2BlockL2Logs(newEncryptedLogs), new L2BlockL2Logs(newUnencryptedLogs)];
    }

    const newCommitments = this.txEffects.flatMap(txEffect => txEffect.newNoteHashes);
    const newNullifiers = this.txEffects.flatMap(txEffect => txEffect.newNullifiers);
    const newPublicDataWrites = this.txEffects.flatMap(txEffect => txEffect.newPublicDataWrites);
    const newL2ToL1Msgs = this.txEffects.flatMap(txEffect => txEffect.newL2ToL1Msgs);
    const newContracts = this.txEffects.flatMap(txEffect => txEffect.contractLeaves);
    const newContractData = this.txEffects.flatMap(txEffect => txEffect.contractData);
    const newL1ToL2Messages = this.l1ToL2Messages;


    return serializeToBuffer(
      newCommitments.length,
      newCommitments,
      newNullifiers.length,
      newNullifiers,
      newPublicDataWrites.length,
      newPublicDataWrites,
      newL2ToL1Msgs.length,
      newL2ToL1Msgs,
      newContracts.length,
      newContracts,
      newContractData,
      newL1ToL2Messages.length,
      newL1ToL2Messages,
      ...logs,
    );
  }

  /**
 * Computes the calldata hash for the L2 block
 * This calldata hash is also computed by the rollup contract when the block is submitted,
 * and inside the circuit, it is part of the public inputs.
 * @returns The calldata hash.
 */
  getCalldataHash() {
    this.assertLogsAttached();

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

  public assertLogsAttached() {
    if (!this.areLogsAttached()) {
      throw new Error(
        `newEncryptedLogs and newUnencryptedLogs must be defined`,
      );
    }
  }

  public areLogsAttached() {
    return this.txEffects.every(txEffect => txEffect.logs !== undefined);
  }
}
