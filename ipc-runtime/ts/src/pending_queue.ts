/** Request ids stay below 2^30 so V8 keeps them as small integers (no heap allocation per call). */
export const REQUEST_ID_SPACE = 2 ** 30;

/** A call awaiting its response. */
export interface PendingCall {
  requestId: number;
  resolve: (data: Uint8Array) => void;
  reject: (error: unknown) => void;
}

/**
 * In-flight calls in issue order, paired to responses by request id. Servers
 * that answer in order (e.g. a serial `run()` loop) always match the head, so
 * the common path is a shift and an integer compare; out-of-order responses
 * fall back to a search. Ids start at a random point so a stale frame from a
 * previous occupant of the channel is unlikely to pair with a live call.
 */
export class PendingQueue {
  private calls: PendingCall[] = [];
  private nextRequestId = Math.floor(Math.random() * REQUEST_ID_SPACE);

  get length(): number {
    return this.calls.length;
  }

  /** Enqueues a call under a fresh request id and returns the id. */
  push(resolve: PendingCall["resolve"], reject: PendingCall["reject"]): number {
    const requestId = this.nextRequestId;
    this.nextRequestId = (requestId + 1) % REQUEST_ID_SPACE;
    this.calls.push({ requestId, resolve, reject });
    return requestId;
  }

  /** Removes the most recently pushed call (to unwind a failed send). */
  pop(): PendingCall | undefined {
    return this.calls.pop();
  }

  /** Removes and returns the call for `requestId`, or undefined if none is pending. */
  take(requestId: number): PendingCall | undefined {
    const calls = this.calls;
    if (calls.length > 0 && calls[0].requestId === requestId) {
      return calls.shift();
    }
    const i = calls.findIndex((c) => c.requestId === requestId);
    return i === -1 ? undefined : calls.splice(i, 1)[0];
  }

  /** Removes and returns every pending call. */
  drain(): PendingCall[] {
    const calls = this.calls;
    this.calls = [];
    return calls;
  }
}
