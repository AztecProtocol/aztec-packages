import { ContractData, PublicDataWrite, TxL2Logs } from '@aztec/circuit-types';
import { sha256 } from '@aztec/foundation/crypto';
import { Fr, MAX_NEW_COMMITMENTS_PER_TX } from '@aztec/circuits.js';

export class TxEffect {
  constructor(
    /**
     * The commitments to be inserted into the note hash tree.
     */
    public newNoteHashes: Fr[],
    /**
     * The nullifiers to be inserted into the nullifier tree.
     */
    public newNullifiers: Fr[],
    /**
     * The L2 to L1 messages to be inserted into the messagebox on L1.
     */
    public newL2ToL1Msgs: Fr[],
    /**
     * The public data writes to be inserted into the public data tree.
     */
    public newPublicDataWrites: PublicDataWrite[],
    /**
     * The leaves of the new contract data that will be inserted into the contracts tree.
     */
    public contractLeaves: Fr[],
    /**
     * The the contracts data of the new contracts.
     */
    public contractData: ContractData[],
    /**
     * The logs attached to the l2 block, both encrypted and unencrypted.
     */
    public logs?: TxEffectLogs,
  ) {
    if (newNoteHashes.length % MAX_NEW_COMMITMENTS_PER_TX !== 0) {
      throw new Error(`The number of new commitments must be a multiple of ${MAX_NEW_COMMITMENTS_PER_TX}.`);
    }
  }

  hash() {
    if (this.logs === undefined) {
      throw new Error('Hashing of a Transaction Effect requires logs to be attached ')
    }

    const commitmentsBuffer = Buffer.concat(this.newNoteHashes.map(x => x.toBuffer()));
    const nullifiersBuffer = Buffer.concat(this.newNullifiers.map(x => x.toBuffer()));
    const publicDataUpdateRequestsBuffer = Buffer.concat(this.newPublicDataWrites.map(x => x.toBuffer()));
    const newL2ToL1MsgsBuffer = Buffer.concat(this.newL2ToL1Msgs.map(x => x.toBuffer()));
    const encryptedLogsHashKernel0 = this.logs!.encryptedLogs.hash();
    const unencryptedLogsHashKernel0 = this.logs!.unencryptedLogs.hash();
    
    const inputValue = Buffer.concat([
      commitmentsBuffer,
      nullifiersBuffer,
      publicDataUpdateRequestsBuffer,
      newL2ToL1MsgsBuffer,
      // We get the first one because we only support 1 new contract per tx
      this.contractLeaves[0].toBuffer(),
      this.contractData[0].contractAddress.toBuffer(),
      // TODO(#3938): make portal address 20 bytes here when updating the hashing
      this.contractData[0].portalContractAddress.toBuffer32(),
      encryptedLogsHashKernel0,
      unencryptedLogsHashKernel0,
    ]);

    return sha256(inputValue);
  }

//   attachLogs(encryptedLogs: L2BlockL2Logs, unencrypedLogs: L2BlockL2Logs) {
//     if (
//       new L2BlockL2Logs(encryptedLogs.txLogs.slice(this.numberOfTxs)).getTotalLogCount() !== 0 ||
//       new L2BlockL2Logs(unencrypedLogs.txLogs.slice(this.numberOfTxs)).getTotalLogCount() !== 0
//     ) {
//       throw new Error('Logs exist in the padded area');
//     }

//     const txEffects = this.body.txEffects;

//     if (this.areLogsAttached()) {
//       if (
//         txEffects.every(
//           (txEffect, i) =>
//             txEffect.logs?.encryptedLogs.equals(encryptedLogs.txLogs[i]) &&
//             txEffect.logs?.unencryptedLogs.equals(unencrypedLogs.txLogs[i]),
//         )
//       ) {
//         L2Block.logger(`Logs already attached`);
//         return;
//       } else {
//         throw new Error(`Trying to attach different logs to block ${this.header.globalVariables.blockNumber}.`);
//       }
//     }

//     txEffects.forEach((txEffect, i) => {
//       txEffect.logs = new TxEffectLogs(encryptedLogs.txLogs[i], unencrypedLogs.txLogs[i]);
//     });
//   }
}

export class TxEffectLogs {
  constructor(
    /**
     * Encrypted logs emitted by txs in this block.
     * @remarks `L2BlockL2Logs.txLogs` array has to match number of txs in this block and has to be in the same order
     *          (e.g. logs from the first tx on the first place...).
     * @remarks Only private function can emit encrypted logs and for this reason length of
     *          `newEncryptedLogs.txLogs.functionLogs` is equal to the number of private function invocations in the tx.
     */
    public encryptedLogs: TxL2Logs,
    /**
     * Unencrypted logs emitted by txs in this block.
     * @remarks `L2BlockL2Logs.txLogs` array has to match number of txs in this block and has to be in the same order
     *          (e.g. logs from the first tx on the first place...).
     * @remarks Both private and public functions can emit unencrypted logs and for this reason length of
     *          `newUnencryptedLogs.txLogs.functionLogs` is equal to the number of all function invocations in the tx.
     */
    public unencryptedLogs: TxL2Logs,
  ) {}
}
