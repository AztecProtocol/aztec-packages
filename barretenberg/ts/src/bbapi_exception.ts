/**
 * Exception thrown when barretenberg API operations fail
 */
export class BBApiException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BBApiException';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BBApiException);
    }
  }
}
