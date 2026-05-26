/** A Set capped to a fixed number of entries, evicting the oldest inserted value when full. */
export class FifoSet<T> extends Set<T> {
  private _limit: number | undefined;

  private constructor(values?: Iterable<T>) {
    super(values);
  }

  /** Creates a bounded set with a positive integer limit. */
  static withLimit<T>(limit: number, values?: Iterable<T>): FifoSet<T> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new TypeError(`FifoSet limit must be a positive safe integer: ${limit}`);
    }

    const set = new FifoSet(values);
    set._limit = limit;
    set.compact();

    return set;
  }

  override add(value: T): this {
    super.add(value);
    this.compact();
    return this;
  }

  /** Maximum number of entries retained by this set. */
  public get limit(): number {
    return this._limit ?? Infinity;
  }

  /** Evicts oldest entries until the set is within its limit. */
  public compact(): void {
    while (this.size > this.limit) {
      const head = this.values().next();
      if (head.done) {
        return;
      }
      this.delete(head.value);
    }
  }

  /** Adds a value only if it is absent, returning whether the set changed. */
  public addIfAbsent(value: T): boolean {
    if (this.has(value)) {
      return false;
    }
    this.add(value);
    return true;
  }
}
