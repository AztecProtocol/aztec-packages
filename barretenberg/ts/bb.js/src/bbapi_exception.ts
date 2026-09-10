/**
 * Raised when bb answers a command with an error rather than a result. The message is bb's own,
 * so the type is what distinguishes "bb said no" from a fault in bb.js itself — in a log, and for
 * a caller that wants to catch one and not the other.
 *
 * Only the native backends raise it. bb's wasm build compiles with BB_NO_EXCEPTIONS, so a failing
 * command aborts into the host's throw hook instead of coming back as an error frame, and the
 * caller sees a plain Error carrying the same message. Catch Error if you need both.
 */
export class BBApiException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BBApiException';
  }
}
