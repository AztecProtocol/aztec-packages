// Implements a queue of message IDs
export class MessageSeenValidator {
  private queue: Array<string>;
  private writePointer = 0;
  private seenMessages: Set<string> = new Set();

  constructor(private queueLength: number) {
    if (this.queueLength <= 0) {
      throw new Error('Queue length must be greater than 0');
    }
    this.queue = new Array<string>(this.queueLength);
  }

  // Adds a message if not seen before. Returns true if added, false if already seen.
  public addMessage(msgId: string): boolean {
    // Check if the message is already in the cache
    if (this.seenMessages.has(msgId)) {
      return false;
    }
    // If we are at the cache limit, remove the oldest msg ID
    if (this.seenMessages.size >= this.queueLength) {
      const msgToRemove = this.queue[this.writePointer];
      this.seenMessages.delete(msgToRemove);
    }

    // Insert the message into the cache and the queue
    this.seenMessages.add(msgId);
    this.queue[this.writePointer] = msgId;
    this.writePointer = this.writePointer === this.queueLength - 1 ? 0 : this.writePointer + 1;
    return true;
  }

  public size() {
    return this.seenMessages.size;
  }
}
