export const MAX_RPC_LEN = 100;
export const MAX_RPC_TXS_LEN = 50;
export const MAX_RPC_BLOCKS_LEN = 50;
export const MAX_RPC_CHECKPOINTS_LEN = 50;
/** Checkpoint data carries no attestations or block bodies, so a page can be larger than a full checkpoint response. */
export const MAX_RPC_CHECKPOINTS_DATA_LEN = 200;
export const MAX_LOGS_PER_TAG = 20;
/** Overrides are written into a public data tree fork before simulation, outside the simulated tx's gas budget. */
export const MAX_RPC_PUBLIC_STORAGE_OVERRIDES_LEN = 200;
export const MAX_RPC_CONTRACT_OVERRIDES_LEN = 50;
