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

/** Oversized reqresp request error
 *
 * Thrown locally (before dialing) when a request payload does not fit in a single muxer frame. Such a request would
 * reach the responder split across multiple chunks, and only the first chunk is processed.
 * @category Errors
 */
export class OversizedReqRespRequestError extends Error {
  constructor(
    public readonly subProtocol: string,
    public readonly payloadSizeBytes: number,
    public readonly maxSizeBytes: number,
  ) {
    super(
      `Request payload of ${payloadSizeBytes} bytes for ${subProtocol} exceeds the ${maxSizeBytes} byte limit of a single muxer frame`,
    );
    this.name = 'OversizedReqRespRequestError';
  }
}
