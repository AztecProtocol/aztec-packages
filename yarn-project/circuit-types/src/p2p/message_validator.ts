import { type PeerErrorSeverity } from './peer_error.js';

/**
 * P2PValidator
 *
 * A validator for P2P messages, which returns a severity of error to be applied to the peer
 */
export interface P2PValidator<T> {
  validate(message: T): Promise<PeerErrorSeverity | undefined>;
}
