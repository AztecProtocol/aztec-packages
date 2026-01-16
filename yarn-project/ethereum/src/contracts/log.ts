import type { Buffer32 } from '@aztec/foundation/buffer';

/** Base L1 event log with common fields. */
export type L1EventLog<T> = {
  /** L1 block number where the event was emitted. */
  l1BlockNumber: bigint;
  /** L1 block hash. */
  l1BlockHash: Buffer32;
  /** L1 transaction hash that emitted the event. */
  l1TransactionHash: `0x${string}`;
  /** Event-specific arguments. */
  args: T;
};
