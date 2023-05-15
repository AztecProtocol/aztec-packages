import { Tx } from '@aztec/types';
import { P2PService } from './service.js';

/**
 * A dummy implementation of the P2P Service.
 */
export class DummyP2PService implements P2PService {
  /**
   * Starts the dummy imaplementation.
   * @returns A resolved promise.
   */
  public start() {
    return Promise.resolve();
  }

  /**
   * Stops the dummy imaplementation.
   * @returns A resolved promise.
   */
  public stop() {
    return Promise.resolve();
  }

  propagateTx(tx: Tx): void {}
  onNewTx(handler: (tx: Tx) => Promise<void>): void {}
}
