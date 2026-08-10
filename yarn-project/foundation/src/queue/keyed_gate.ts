import { Semaphore } from './semaphore.js';

/** A single-key semaphore together with the number of holders and waiters using it. */
type Gate = {
  semaphore: Semaphore;
  users: number;
};

/**
 * Provides mutually exclusive access per key while allowing work for different keys to proceed concurrently.
 * Gates are removed when their last holder or waiter releases them.
 */
export class KeyedGate<Key> {
  private readonly gates = new Map<Key, Gate>();

  /** Acquires the gate for `key` and returns its idempotent release function. */
  public async acquire(key: Key): Promise<() => void> {
    const gate = this.gates.get(key) ?? { semaphore: new Semaphore(1), users: 0 };
    this.gates.set(key, gate);
    gate.users++;
    await gate.semaphore.acquire();

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      gate.semaphore.release();
      gate.users--;
      if (gate.users === 0) {
        this.gates.delete(key);
      }
    };
  }
}
