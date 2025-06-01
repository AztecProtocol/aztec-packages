import { createLogger } from '@aztec/foundation/log';

type TimeCache = {
  endTime: Date;
  msgIds: Set<string>;
};

const TIME_CACHE_LENGTH_MS = 60 * 1000; // 1 minute

// Implements a simple sliding window cache of message IDS (strings).
// Works on the basis of 1 minute windows
export class MessageSeenValidator {
  #timeCache: TimeCache[] = [];
  #seenMessages: Set<string> = new Set();

  constructor(
    private timeToLiveMinutes: number,
    private timeProvider: () => Date = () => new Date(),
    private log = createLogger('p2p:msg_seen_validator'),
  ) {}
  public addMessage(msgId: string): boolean {
    this.cleanUpTimeCache();
    if (this.#seenMessages.has(msgId)) {
      return false;
    }
    this.addToTimeCache(msgId);
    return true;
  }

  private addToTimeCache(msgId: string): void {
    const now = this.timeProvider().getTime();
    this.#seenMessages.add(msgId);
    if (this.#timeCache.length === 0 || this.#timeCache[this.#timeCache.length - 1].endTime.getTime() < now) {
      const newCache = {
        endTime: new Date(now + TIME_CACHE_LENGTH_MS),
        msgIds: new Set([msgId]),
      };
      this.#timeCache.push(newCache);
    } else {
      this.#timeCache[this.#timeCache.length - 1].msgIds.add(msgId);
    }
  }
  private cleanUpTimeCache(): void {
    const cutOff = this.timeProvider().getTime() - this.timeToLiveMinutes * 60 * 1000;
    while (this.#timeCache.length > 0 && this.#timeCache[0].endTime.getTime() < cutOff) {
      const oldestCache = this.#timeCache.shift();
      oldestCache?.msgIds.forEach(msgId => this.#seenMessages.delete(msgId));
    }
  }
}
