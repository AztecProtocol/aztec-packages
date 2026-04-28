import type { Branded } from '@aztec/foundation/branded-types';

import type { Hex } from 'viem';

/** URI pointing to a stored failed L1 transaction. */
export type FailedL1TxUri = Branded<string, 'FailedL1TxUri'>;

/** A failed L1 transaction captured for debugging and replay. */
export type FailedL1Tx = {
  /** Tx hash (for reverts) or keccak256(request.data) (for simulation/send failures). */
  id: Hex;
  /** Unix timestamp (ms) when failure occurred. */
  timestamp: number;
  /** Whether the failure was during simulation or after sending. */
  failureType: 'simulation' | 'revert' | 'send-error';
  /** The actual L1 transaction for replay (multicall-encoded for bundled txs). */
  request: {
    to: Hex;
    data: Hex;
    value?: string; // bigint as string
  };
  /** Raw blob data as hex for replay. */
  blobData?: Hex[];
  /** L1 block number at time of failure (simulation target or receipt block). */
  l1BlockNumber: string; // bigint as string
  /** Receipt info (present only for on-chain reverts). */
  receipt?: {
    transactionHash: Hex;
    blockNumber: string; // bigint as string
    gasUsed: string; // bigint as string
    status: 'reverted';
  };
  /** Error information. */
  error: {
    message: string;
    /** Decoded error name (e.g., 'Rollup__InvalidProposer'). */
    name?: string;
  };
  /** Context metadata. */
  context: {
    /** Actions involved (e.g., ['propose', 'governance-signal']). */
    actions: string[];
    /** Individual request data for each action (metadata, not used for replay). */
    requests?: Array<{ action: string; to: Hex; data: Hex }>;
    checkpointNumber?: number;
    slot?: number;
    sender: Hex;
  };
};

/** Store for failed L1 transactions for debugging purposes. */
export interface L1TxFailedStore {
  /** Saves a failed transaction and returns its URI. */
  saveFailedTx(tx: FailedL1Tx): Promise<FailedL1TxUri>;
  /** Retrieves a failed transaction by its URI. */
  getFailedTx(uri: FailedL1TxUri): Promise<FailedL1Tx>;
}
