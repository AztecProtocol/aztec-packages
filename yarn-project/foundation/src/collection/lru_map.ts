/** Node in a doubly-linked list used by {@link LruMap}. */
type LruNode<K, V> = {
  key: K;
  value: V;
  prev: LruNode<K, V> | undefined;
  next: LruNode<K, V> | undefined;
};

/**
 * A bounded key-value map with Least Recently Used (LRU) eviction.
 * Both {@link get} and {@link set} count as an access and refresh the entry's
 * recency, so entries that are actively used stay in the map longest.
 *
 * Uses a doubly-linked list for O(1) ordering and a Map for O(1) lookup.
 * Head = least recent, tail = most recent.
 */
export class LruMap<K, V> {
  /** Map from key to its linked-list node for O(1) lookup. */
  private readonly map = new Map<K, LruNode<K, V>>();
  private head: LruNode<K, V> | undefined;
  private tail: LruNode<K, V> | undefined;

  constructor(private readonly maxSize: number) {
    if (maxSize < 1) {
      throw new Error('LruMap maxSize must be at least 1');
    }
  }

  /** Number of entries in the map. */
  get size(): number {
    return this.map.size;
  }

  /** Returns true if the key is present, without refreshing its recency. */
  has(key: K): boolean {
    return this.map.has(key);
  }

  /**
   * Returns the value for the key, or undefined if absent.
   * Refreshes the entry's recency so it becomes the most recently used.
   */
  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) {
      return undefined;
    }
    this.moveToTail(node);
    return node.value;
  }

  /**
   * Stores a value for the key, refreshing its recency. If the key already exists, overwrites the value.
   * If the map is at capacity, evicts the least recently used entry.
   */
  set(key: K, value: V): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.moveToTail(existing);
      return;
    }

    if (this.map.size >= this.maxSize) {
      this.evictHead();
    }

    const node: LruNode<K, V> = { key, value, prev: this.tail, next: undefined };
    if (this.tail) {
      this.tail.next = node;
    } else {
      this.head = node;
    }
    this.tail = node;
    this.map.set(key, node);
  }

  /** Removes the entry for the key, returning true if it was present. */
  delete(key: K): boolean {
    const node = this.map.get(key);
    if (!node) {
      return false;
    }
    this.unlink(node);
    this.map.delete(key);
    return true;
  }

  /** Removes all entries from the map. */
  clear(): void {
    this.map.clear();
    this.head = undefined;
    this.tail = undefined;
  }

  /** Unlinks a node from its current position and relinks it at the tail. */
  private moveToTail(node: LruNode<K, V>): void {
    if (node === this.tail) {
      return;
    }
    this.unlink(node);

    node.prev = this.tail;
    node.next = undefined;
    if (this.tail) {
      this.tail.next = node;
    } else {
      this.head = node;
    }
    this.tail = node;
  }

  /** Detaches a node from the linked list, fixing up its neighbours and the head/tail pointers. */
  private unlink(node: LruNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    node.prev = undefined;
    node.next = undefined;
  }

  /** Evicts the head (least recently used) node. */
  private evictHead(): void {
    const oldHead = this.head;
    if (!oldHead) {
      return;
    }
    this.head = oldHead.next;
    if (this.head) {
      this.head.prev = undefined;
    } else {
      this.tail = undefined;
    }
    this.map.delete(oldHead.key);
  }
}
