/** Individual request timeout error
 *
 * This error will be thrown when a request to a specific peer times out.
 * @category Errors
 */
export class IndividualReqRespTimeoutError extends Error {
  constructor() {
    super(`Request to peer timed out`);
  }
}

/** Collective request timeout error
 *
 * This error will be thrown when a req resp request times out regardless of the peer.
 * @category Errors
 */
export class CollectiveReqRespTimeoutError extends Error {
  constructor() {
    super(`Request to all peers timed out`);
  }
}

/** Invalid response error
 *
 * This error will be thrown when a response is received that is not valid.
 *
 * This error does not need to be punished as message validators will handle punishing invalid
 * requests
 * @category Errors
 */
export class InvalidResponseError extends Error {
  constructor() {
    super(`Invalid response received`);
  }
}
