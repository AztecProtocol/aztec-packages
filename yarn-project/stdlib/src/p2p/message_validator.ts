import type { PeerErrorSeverity } from './peer_error.js';

/**
 * Result of validating a P2P message.
 * - 'accept': Message is valid and should be accepted and processed
 * - 'ignore': Message should be ignored (not propagated or processed, but sender not penalized)
 * - 'reject': Message is invalid (rejected and sender penalized)
 */
export type ValidationResult =
  | { result: 'accept' }
  | { result: 'ignore' }
  | { result: 'reject'; severity: PeerErrorSeverity };

/**
 * P2PValidator
 *
 * A validator for P2P messages, which returns a ValidationResult indicating
 * whether to accept, ignore, or reject the message
 */
export interface P2PValidator<T> {
  validate(message: T): Promise<ValidationResult>;
}
