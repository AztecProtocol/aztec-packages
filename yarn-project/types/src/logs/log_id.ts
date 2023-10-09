
/** A globally unique log id. */
export type LogId = {
  /** The block number in which the tx containing the log was included. */
  blockNumber: number;
  /** The index of a tx in a block. */
  txIndex: number;
  /** The index of the log within a transaction. */
  logIndex: number;
};

/**
 * Parses a log id from a string.
 * @param logId - A string representation of a log id.
 * @returns A log id.
 */
export function parseLogId(logId: string): LogId {
  const [rawBlockNumber, rawTxIndex, rawLogIndex] = logId.split('-');
  const blockNumber = Number(rawBlockNumber);
  const txIndex = Number(rawTxIndex);
  const logIndex = Number(rawLogIndex);

  if (!Number.isInteger(blockNumber)) {
    throw new Error(`Invalid block number in log id: ${logId}`);
  }
  if (!Number.isInteger(txIndex)) {
    throw new Error(`Invalid tx index in log id: ${logId}`);
  }
  if (!Number.isInteger(logIndex)) {
    throw new Error(`Invalid log index in log id: ${logId}`);
  }

  return {
    blockNumber,
    txIndex,
    logIndex,
  };
}
