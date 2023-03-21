export interface P2P {
  sendTx(tx: Tx): void;
  getTxs(): Tx[];
}

export interface Tx {
  txId: Buffer;
}

export interface Rollup {
  rollupId: number;
  settlementTimestamp?: number;
  txs?: Tx[];
}

export interface RollupSource {
  getLastRollupId(): number;
  getRollups(from: number, take: number): Rollup[];
}
