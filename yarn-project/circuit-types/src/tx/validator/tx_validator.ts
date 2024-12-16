import { type ProcessedTx } from '../processed_tx.js';
import { type Tx } from '../tx.js';

export type AnyTx = Tx | ProcessedTx;

export interface TxValidator<T extends AnyTx = AnyTx> {
  validateTx(tx: T): Promise<boolean>;
  validateTxs(txs: T[]): Promise<[validTxs: T[], invalidTxs: T[], skippedTxs?: T[]]>;
}
