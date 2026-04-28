/** Node in a doubly-linked list used by {@link LruSet}. */
type LruNode<T> = {
  value: T;
  prev: LruNode<T> | undefined;
  next: LruNode<T> | undefined;
};

/**
 * A bounded set with Least Recently Used (LRU) eviction.
 * Both {@link has} and {@link add} count as an access and refresh the entry's
 * recency, so items that are actively checked stay in the set longest.
 *
 * Uses a doubly-linked list for O(1) ordering and a Map for O(1) lookup.
 * Head = least recent, tail = most recent.
 */
export class LruSet<T> {
  /** Map from value to its linked-list node for O(1) lookup. */
  private readonly map = new Map<T, LruNode<T>>();
  private head: LruNode<T> | undefined;
  private tail: LruNode<T> | undefined;

  constructor(private readonly maxSize: number) {
    if (maxSize < 1) {
      throw new Error('LruSet maxSize must be at least 1');
    }
  }

  /** Number of entries in the set. */
  get size(): number {
    return this.map.size;
  }

  /**
   * Returns true if the item is in the set.
   * Refreshes the item's recency so it becomes the most recently used.
   */
  has(item: T): boolean {
    const node = this.map.get(item);
    if (!node) {
      return false;
    }
    this.moveToTail(node);
    return true;
  }

  /**
   * Adds an item to the set. If the item already exists, refreshes its recency.
   * If the set is at capacity, evicts the least recently used item.
   */
  add(item: T): void {
    const existing = this.map.get(item);
    if (existing) {
      this.moveToTail(existing);
      return;
    }

    if (this.map.size >= this.maxSize) {
      this.evictHead();
    }

    const node: LruNode<T> = { value: item, prev: this.tail, next: undefined };
    if (this.tail) {
      this.tail.next = node;
    } else {
      this.head = node;
    }
    this.tail = node;
    this.map.set(item, node);
  }

  /** Removes all entries from the set. */
  clear(): void {
    this.map.clear();
    this.head = undefined;
    this.tail = undefined;
  }

  /** Unlinks a node from its current position and relinks it at the tail. */
  private moveToTail(node: LruNode<T>): void {
    if (node === this.tail) {
      return;
    }

    // Unlink
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }

    // Relink at tail
    node.prev = this.tail;
    node.next = undefined;
    if (this.tail) {
      this.tail.next = node;
    }
    this.tail = node;
  }

  /** Evicts the head (least recently used) node. */
  private evictHead(): void {
    const oldHead = this.head!;
    this.map.delete(oldHead.value);

    this.head = oldHead.next;
    if (this.head) {
      this.head.prev = undefined;
    } else {
      this.tail = undefined;
    }
  }
}
