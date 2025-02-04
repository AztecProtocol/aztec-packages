/**
 * The error codes for the ReqResp protocol
 */
export enum ReqRespStatus {
  SUCCESS = 0,
  RATE_LIMIT_EXCEEDED = 1,

  // TODO: update the below errors
  COLLECTIVE_TIMEOUT = 2,
  INDIVIDUAL_TIMEOUT = 3,
  INVALID_RESPONSE = 4,
  UNKNOWN = 5,
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
    case ReqRespStatus.COLLECTIVE_TIMEOUT:
      return 'COLLECTIVE_TIMEOUT';
    case ReqRespStatus.INDIVIDUAL_TIMEOUT:
      return 'INDIVIDUAL_TIMEOUT';
    case ReqRespStatus.INVALID_RESPONSE:
      return 'INVALID_RESPONSE';
    case ReqRespStatus.UNKNOWN:
      return 'UNKNOWN';
  }
}
