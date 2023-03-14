// TODO: Complete definition or import from another package (add txs at least!)
export interface L2BlockData {
  id: number;
}

/**
 * Given the necessary rollup data, verifies it, and updates the underlying state accordingly to advance the state of the system.
 * See https://hackmd.io/ouVCnacHQRq2o1oRc5ksNA#RollupReceiver
 */
export interface L2BlockReceiver {
  processL2Block(l2BlockData: L2BlockData): Promise<boolean>;
}