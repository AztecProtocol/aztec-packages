/**
 * A class implementing a two-phase commit pattern for values.
 *
 * Committable provides a mechanism to stage changes to a value and either commit them
 * (making them permanent) or roll them back (discarding the changes). This is useful for
 * implementing transactional semantics, speculative execution, or any scenario where you
 * need to work with tentative changes before finalizing them.
 *
 * The class maintains two states:
 * - Current value: The committed, stable value
 * - Next value: The uncommitted, tentative value (if any changes are staged)
 *
 * @typeParam T - The type of value being managed
 *
 * @example
 * ```typescript
 * // Create a committable with initial value
 * const counter = new Committable(0);
 *
 * // Read current value
 * counter.get(); // Returns: 0
 *
 * // Stage a change
 * counter.set(5);
 * counter.get(); // Returns: 0 (still shows committed value)
 * counter.get(true); // Returns: 5 (includes uncommitted)
 *
 * // Commit the change
 * counter.commit();
 * counter.get(); // Returns: 5 (now committed)
 *
 * // Stage and rollback
 * counter.set(10);
 * counter.get(true); // Returns: 10
 * counter.rollback();
 * counter.get(); // Returns: 5 (rolled back to committed value)
 * ```
 *
 * @example
 * ```typescript
 * // Transactional updates to complex objects
 * interface State {
 *   balance: number;
 *   nonce: number;
 * }
 *
 * const state = new Committable<State>({ balance: 100, nonce: 0 });
 *
 * // Try to execute transaction
 * try {
 *   state.set({ balance: state.get().balance - 50, nonce: state.get().nonce + 1 });
 *   // ... do other operations that might fail ...
 *   state.commit(); // Success: changes are permanent
 * } catch (error) {
 *   state.rollback(); // Failure: discard changes
 * }
 * ```
 *
 * @remarks
 * - Only one uncommitted value can be staged at a time
 * - Setting a new value while there's already an uncommitted value overwrites it
 * - Committing when there's no staged value is a no-op
 * - The current value is immutable until commit() is called
 * - Useful for speculative execution, optimistic updates, and transaction semantics
 */
export class Committable<T> {
  private currentValue: T;
  private nextValue: T | undefined = undefined;

  constructor(initialValue: T) {
    this.currentValue = initialValue;
  }

  /**
   * Commits the uncommitted value.
   */
  public commit() {
    if (this.nextValue === undefined) {
      return;
    }
    this.currentValue = this.nextValue;
    this.nextValue = undefined;
  }

  /**
   * Rolls back the uncommitted value.
   */
  public rollback() {
    this.nextValue === undefined;
  }

  /**
   * Gets the current value.
   * @param includeUncommitted - Whether to include the uncommitted value.
   * @returns The current value if includeUncommitted is false, otherwise the uncommitted value.
   */
  public get(includeUncommitted: boolean = false): T {
    return includeUncommitted && this.nextValue ? this.nextValue : this.currentValue;
  }

  /**
   * Sets the next value to be committed to.
   * @param value - The new value to be set.
   */
  public set(value: T) {
    this.nextValue = value;
  }
}
