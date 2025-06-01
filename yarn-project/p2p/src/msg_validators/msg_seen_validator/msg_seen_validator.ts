type TimeCache = {
  endTime: Date;
  msgIds: Set<string>;
};

const TIME_CACHE_WINDOW_LENGTH_MS = 60 * 1000; // 1 minute

// Implements a simple sliding window cache of message IDs (strings).
// Works on the basis of 1 minute windows
export class MessageSeenValidator {
  #timeCache: TimeCache[] = [];
  #seenMessages: Set<string> = new Set();

  constructor(
    private timeToLiveMinutes: number,
    private timeProvider: () => Date = () => new Date(),
  ) {}

  // Adds a message if not seen before. Returns true if added, false if already seen.
  public addMessage(msgId: string): boolean {
    // Perform housekeeping on the cache
    this.cleanUpTimeCache();

    // Validate the message
    if (this.#seenMessages.has(msgId)) {
      return false;
    }

    // Add to cache
    this.addToTimeCache(msgId);
    return true;
  }

  public size() {
    return this.#seenMessages.size;
  }

  private addToTimeCache(msgId: string): void {
    const now = this.timeProvider().getTime();

    // Add to main cache
    this.#seenMessages.add(msgId);

    // If the time is beyond the most recent window, create a new one
    if (this.#timeCache.length === 0 || this.#timeCache[this.#timeCache.length - 1].endTime.getTime() < now) {
      const newCache = {
        endTime: new Date(now + TIME_CACHE_WINDOW_LENGTH_MS),
        msgIds: new Set([msgId]),
      };
      this.#timeCache.push(newCache);
    } else {
      // Add to the most recent window
      this.#timeCache[this.#timeCache.length - 1].msgIds.add(msgId);
    }
  }
  private cleanUpTimeCache(): void {
    // Walk through the windows and remove those that are beyond the TTL
    const cutOff = this.timeProvider().getTime() - this.timeToLiveMinutes * 60 * 1000;
    while (this.#timeCache.length > 0 && this.#timeCache[0].endTime.getTime() < cutOff) {
      const oldestCache = this.#timeCache.shift();
      oldestCache?.msgIds.forEach(msgId => this.#seenMessages.delete(msgId));
    }
  }
}
