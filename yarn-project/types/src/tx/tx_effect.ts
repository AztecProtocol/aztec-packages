import { Fr } from '@aztec/circuits.js';

import { ContractData } from '../contract_data.js';
import { TxL2Logs } from '../logs/tx_l2_logs.js';
import { PublicDataWrite } from '../public_data_write.js';

/** Effects of a tx on the network state. */
export class TxEffect {
  constructor(
    /** Note hashes emitted in this tx. */
    public readonly noteHashes: Fr[],
    /** Nullifiers emitted in this tx. */
    public readonly nullifiers: Fr[],
    /** The L2 to L1 messages produced by this tx. */
    public readonly l2ToL1Msgs: Fr[],
    /** Contract data of contracts deployed in this tx. */
    public readonly contracts: ContractData[],
    /** The public data writes created by this tx. */
    public readonly publicWrites: PublicDataWrite[],
    /**
     * Encrypted logs emitted by this tx.
     * @remarks Only private function emit encrypted logs and for this reason length of `encryptedLogs.functionLogs`
     *          is equal to the number of private function invocations in the tx.
     */
    public readonly encryptedLogs: TxL2Logs,
    /**
     * Encrypted logs emitted by this tx.
     * @remarks Both private and public functions can emit unencrypted logs and for this reason length of
     *          `unencryptedLogs.functionLogs` is equal to the number of all function invocations in the tx.
     */
    public readonly unencryptedLogs: TxL2Logs,
  ) {}
}
