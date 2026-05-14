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
