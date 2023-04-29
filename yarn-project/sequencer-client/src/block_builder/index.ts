import { L2Block } from '@aztec/types';
import { ProcessedTx } from '../sequencer/processed_tx.js';
import { Proof } from '@aztec/circuits.js';

export interface BlockBuilder {
  buildL2Block(blockNumber: number, txs: ProcessedTx[]): Promise<[L2Block, Proof]>;
}
