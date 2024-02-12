import { TxL2Logs } from './tx_l2_logs.js';

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
