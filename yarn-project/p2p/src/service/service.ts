import { Tx } from '@aztec/types';

/**
 * The interface for a P2P service implementation.
 */
export interface P2PService {
  start(): Promise<void>;

  stop(): Promise<void>;

  propagateTx(tx: Tx): void;

  onNewTx(handler: (tx: Tx) => Promise<void>): void;
}
