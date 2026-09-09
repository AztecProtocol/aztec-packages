import type { DateProvider } from '@aztec/foundation/timer';
import { execWithSignal } from '@aztec/foundation/timer';

/**
 * How long a run gets when the budget has already run out. The duty still makes the single attempt its callers
 * rely on, but bounded, so an unresponsive read cannot hold an expired duty open. Long enough for a local store
 * read, short enough that nothing waits on it.
 */
const EXPIRED_BUDGET_GRACE_MS = 1_000;

/** Thrown when a duty's absolute budget runs out while work it was awaiting is still outstanding. */
export class DutyBudgetExpiredError extends Error {
  constructor(
    public readonly what: string,
    public readonly deadline: Date,
  ) {
    super(`Duty budget for ${what} ran out at ${deadline.toISOString()}`);
    this.name = 'DutyBudgetExpiredError';
  }
}

/**
 * The one absolute budget a slot's duty runs under, shared by every stage instead of each read starting a fresh
 * full timeout of its own.
 *
 * Two separate problems need solving and a timeout alone solves neither on its own. A read that never settles has
 * to stop blocking the duty, which needs a race; and racing does not stop the losing continuation, because
 * JavaScript cannot be killed, so anything that continuation would start afterwards has to consult the budget
 * first. {@link run} covers the race and hands the attempt the signal; {@link expired} covers everything a caller
 * is about to begin.
 *
 * The budget can also be stopped early, for work whose sibling has already failed: retries that no caller will
 * read any more are cancelled rather than left forcing syncs for the rest of the slot.
 */
export class DutyBudget {
  private readonly controller = new AbortController();

  constructor(
    public readonly deadline: Date,
    private readonly dateProvider: DateProvider,
  ) {}

  /** Milliseconds left before the budget runs out; zero once it has, or once the duty was stopped. */
  public remainingMs(): number {
    if (this.controller.signal.aborted) {
      return 0;
    }
    return Math.max(0, this.deadline.getTime() - this.dateProvider.now());
  }

  /** Whether the budget is gone, because the deadline passed or because the duty was stopped. */
  public expired(): boolean {
    return this.remainingMs() === 0;
  }

  /** The signal callees should pass on and check; aborted once the budget is gone. */
  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  /**
   * Stops the duty now. Work already in flight is not killed — it settles into a caller that has moved on — but
   * every stage that checks the budget stops starting more.
   */
  public stop(reason: string): void {
    if (!this.controller.signal.aborted) {
      this.controller.abort(new DutyBudgetExpiredError(reason, this.deadline));
    }
  }

  /**
   * Runs `fn` bounded by the budget, throwing {@link DutyBudgetExpiredError} rather than waiting on a read that
   * never settles. The attempt itself keeps running, so `fn` should honour the signal it is handed and callers
   * must still check {@link expired} before starting anything further.
   *
   * A budget that has already run out still gets {@link EXPIRED_BUDGET_GRACE_MS}: a duty past its deadline is
   * expected to make the one attempt its callers rely on — a proposal whose blocks are already local validates
   * without waiting for anything — and the point here is that even that attempt cannot hang. A duty that was
   * explicitly stopped gets no grace: its result has no reader left.
   */
  public async run<T>(what: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.controller.signal.aborted) {
      throw new DutyBudgetExpiredError(what, this.deadline);
    }
    const remainingMs = this.remainingMs() || EXPIRED_BUDGET_GRACE_MS;
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(remainingMs)]);
    return await execWithSignal(fn, signal, () => new DutyBudgetExpiredError(what, this.deadline));
  }
}
