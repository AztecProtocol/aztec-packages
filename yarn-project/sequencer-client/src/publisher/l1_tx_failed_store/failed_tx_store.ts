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
  /** How the failure occurred. */
  failureType: 'simulation' | 'revert' | 'send-error' | 'timeout';
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
  /** Gas pricing info at time of failure for underpricing diagnosis. */
  gasInfo?: {
    /** Gas prices the tx was sent with (present for revert/send-error/timeout, not simulation). */
    sentGasPrice?: {
      maxFeePerGas: string; // bigint as string
      maxPriorityFeePerGas: string;
      maxFeePerBlobGas?: string;
    };
    /** Gas limit used or estimated. */
    gasLimit?: string; // bigint as string
    /** Nonce used for the sent tx. */
    nonce?: number;
    /**
     * For timeouts: the escalating gas prices used across the initial send and each speed-up retry,
     * in order. Compare against windowBlocks[].minIncludedPriorityFee to see if any attempt cleared the bar.
     */
    sentGasPriceLadder?: {
      maxFeePerGas: string;
      maxPriorityFeePerGas: string;
      maxFeePerBlobGas?: string;
    }[];
    /** Number of send attempts (initial send + speed-ups). */
    attempts?: number;
    /**
     * Per-block fee data for the L1 blocks the tx could have been included in (the target L2 slot's
     * inclusion window), in chronological order. Compare sentGasPrice against these to see whether
     * the tx was underpriced for each block it competed for. May be a partial or empty list if the
     * window was not yet mined when the failure was recorded (e.g. an early send failure).
     */
    windowBlocks?: {
      blockNumber: string;
      /** Unix timestamp (seconds) of the block. */
      timestamp: string;
      /** Base fee of the block. */
      baseFeePerGas: string;
      /** 75th percentile priority fee among the block's txs. */
      p75PriorityFee: string;
      /** Minimum priority fee among all included txs — the inclusion bar for this block. */
      minIncludedPriorityFee: string;
      /** Minimum priority fee among included blob txs. */
      minIncludedBlobPriorityFee: string;
      /** Whether the block's blob space was full. */
      blockBlobsFull: boolean;
      /** Number of blob txs included. */
      includedBlobTxCount: number;
      /** Total blob count included. */
      includedBlobCount: number;
    }[];
  };
  /** Timing info relative to the L2 slot. */
  timing?: {
    /** The target L2 slot this tx was for. */
    targetL2Slot?: number;
    /** Unix timestamp (seconds) when the target slot ends. */
    slotDeadlineTimestampS?: string; // bigint as string
    /** Milliseconds remaining until the slot deadline. Negative = past deadline. */
    msUntilSlotDeadline?: number;
  };
};

/** Store for failed L1 transactions for debugging purposes. */
export interface L1TxFailedStore {
  /** Saves a failed transaction and returns its URI. */
  saveFailedTx(tx: FailedL1Tx): Promise<FailedL1TxUri>;
  /** Retrieves a failed transaction by its URI. */
  getFailedTx(uri: FailedL1TxUri): Promise<FailedL1Tx>;
}
