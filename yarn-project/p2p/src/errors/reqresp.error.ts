/** Individual request timeout error
 *
 * This error will be thrown when a request to a specific peer times out.
 * @category Errors
 */
export class IndiviualReqRespTimeoutError extends Error {
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
