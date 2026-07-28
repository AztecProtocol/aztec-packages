export const MAX_RPC_LEN = 100;
export const MAX_RPC_TXS_LEN = 100;
export const MAX_RPC_BLOCKS_LEN = 100;
export const MAX_RPC_CHECKPOINTS_LEN = 100;
/** Checkpoint data carries no attestations or block bodies, so a page can be larger than a full checkpoint response. */
export const MAX_RPC_CHECKPOINTS_DATA_LEN = 200;
/**
 * Page cap for range reads whose `include*` options attach a transaction body or a proof to every
 * element. The `MAX_RPC_*_LEN` caps count elements, not bytes, so those reads need a tighter bound.
 */
export const MAX_RPC_HEAVY_LEN = 50;
/**
 * Upper bound on the attestations an RPC response may carry for a single slot. Must stay above the
 * network's target committee size, which `api_limit.test.ts` asserts.
 */
export const MAX_COMMITTEE_SIZE = 256;
export const MAX_LOGS_PER_TAG = 20;
/** Overrides are written into a public data tree fork before simulation, outside the simulated tx's gas budget. */
export const MAX_RPC_PUBLIC_STORAGE_OVERRIDES_LEN = 200;
export const MAX_RPC_CONTRACT_OVERRIDES_LEN = 50;
