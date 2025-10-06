/**
 * Any known (and checked) error that can be thrown during public execution.
 * Includes AvmExecutionErrors and SideEffectErrors.
 *
 * AvmSimulator catches any checked errors before returning a boolean "reverted".
 * Unchecked errors are generally the result of a bug. They are propagated and
 * ultimately will be the resonsibility of PublicProcessor to handle.
 */
export abstract class CheckedPublicExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckedPublicExecutionError';
  }
}
