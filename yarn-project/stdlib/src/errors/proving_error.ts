/**
 * An error thrown when generating a proof fails.
 */
export class ProvingError extends Error {
  public static readonly NAME = 'ProvingError';

  /**
   * Creates a new instance
   * @param message - The error message.
   * @param cause - The cause of the error.
   * @param retry - Whether the proof should be retried.
   */
  constructor(
    message: string,
    cause?: unknown,
    public readonly retry: boolean = false,
  ) {
    super(message);
    this.name = ProvingError.NAME;
    this.cause = cause;
  }
}
