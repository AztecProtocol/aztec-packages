import type { TxStatus } from '@aztec/stdlib/tx';

/** Options related to waiting for a tx. */
export type WaitOpts = {
  /** The amount of time to ignore TxStatus.DROPPED receipts (in seconds) due to the presumption that it is being propagated by the p2p network. Defaults to 5. */
  ignoreDroppedReceiptsFor?: number;
  /** The maximum time (in seconds) to wait for the transaction to be mined. Defaults to 300 (5 min). */
  timeout?: number;
  /** The time interval (in seconds) between retries to fetch the transaction receipt. Defaults to 1. */
  interval?: number;
  /** Whether to accept a revert as a status code for the tx when waiting for it. If false, will throw if the tx reverts. */
  dontThrowOnRevert?: boolean;
  /** The minimum inclusion status to wait for. If set, waits until the receipt reaches this status or higher. Defaults to CHECKPOINTED. */
  waitForStatus?: TxStatus;
  /**
   * The time (in seconds) to wait before the first receipt poll. Defaults to 0. Used to avoid checking for a receipt
   * right after sending a tx, when we know it cannot have been mined yet. Counts against `timeout`.
   */
  initialDelay?: number;
};

export const DefaultWaitOpts: WaitOpts = {
  ignoreDroppedReceiptsFor: 5,
  timeout: 300,
  interval: 1,
};
