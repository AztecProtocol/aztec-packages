/** A tracked request: the awaitable to wait on, plus an optional interrupt to cancel it early. */
type TrackedRequest = { promise: Promise<unknown>; interrupt?: () => void };

/**
 * Tracks fire-and-forget requests so a shutdown path can interrupt any in-flight work and await it to
 * settle. Each tracked request is a promise plus an optional interrupt callback; the entry removes itself
 * from the bag once its promise settles, so the tracker only ever holds requests that are still in flight.
 */
export class RequestsTracker {
  private readonly requests = new Map<number, TrackedRequest>();
  private nextId = 0;

  /** Number of in-flight requests currently tracked. */
  public get size(): number {
    return this.requests.size;
  }

  /**
   * Tracks a fire-and-forget request. `interrupt`, when provided, is invoked by {@link interruptRequests}
   * to cancel the in-flight work so its promise settles promptly. The entry auto-removes once `promise`
   * settles, whether it resolves or rejects.
   */
  public trackRequest(promise: Promise<unknown>, interrupt?: () => void): void {
    const id = this.nextId++;
    const settled = promise.then(
      () => this.requests.delete(id),
      () => this.requests.delete(id),
    );
    this.requests.set(id, { promise: settled, interrupt });
  }

  /** Interrupts every in-flight request that was tracked with an interrupt callback. */
  public interruptRequests(): void {
    for (const { interrupt } of this.requests.values()) {
      interrupt?.();
    }
  }

  /** Awaits every currently in-flight request to settle. */
  public async awaitRequests(): Promise<void> {
    await Promise.all([...this.requests.values()].map(request => request.promise));
  }
}
