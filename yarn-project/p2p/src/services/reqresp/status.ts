/**
 * The error codes for the ReqResp protocol
 */
export enum ReqRespStatus {
  SUCCESS = 0,
  RATE_LIMIT_EXCEEDED = 1,
  BADLY_FORMED_REQUEST = 2,
  FAILURE = 126,
  UNKNOWN = 127,
}

export class ReqRespStatusError extends Error {
  /**
   * The status code
   */
  status: ReqRespStatus;

  constructor(status: ReqRespStatus) {
    super(`ReqResp Error: ${prettyPrintReqRespStatus(status)}`);
    this.status = status;
  }
}

/**
 * Parse the status chunk
 * @param chunk
 * @returns
 *
 * @throws ReqRespStatusError if the chunk is not valid
 */
export function parseStatusChunk(chunk: Uint8Array): ReqRespStatus {
  if (chunk.length !== 1) {
    throw new ReqRespStatusError(ReqRespStatus.UNKNOWN);
  }

  const status = chunk[0];
  // Check if status is a valid ReqRespStatus value
  if (!(status in ReqRespStatus)) {
    throw new ReqRespStatusError(ReqRespStatus.UNKNOWN);
  }
  return status as ReqRespStatus;
}

/**
 * Pretty print the ReqResp status
 * @param status
 * @returns
 */
export function prettyPrintReqRespStatus(status: ReqRespStatus) {
  switch (status) {
    case ReqRespStatus.SUCCESS:
      return 'SUCCESS';
    case ReqRespStatus.RATE_LIMIT_EXCEEDED:
      return 'RATE_LIMIT_EXCEEDED';
    case ReqRespStatus.BADLY_FORMED_REQUEST:
      return 'BADLY_FORMED_REQUEST';
    case ReqRespStatus.FAILURE:
      return 'FAILURE';
    case ReqRespStatus.UNKNOWN:
      return 'UNKNOWN';
  }
}
