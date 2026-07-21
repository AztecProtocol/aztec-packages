/**
 * TypeScript counterpart of Noir's `Option<T>`.
 *
 * Wraps a value that may or may not be present. Use {@link Option.some} to wrap a present value and
 * {@link Option.none} for an absent one. The type guards {@link isSome} and {@link isNone} narrow
 * `value` in conditional branches.
 */
export class Option<T> {
  private constructor(
    public readonly value: T | undefined,
    // `unknown` (not the descriptor shape) keeps this generic Option decoupled from the serialization layer's
    // `{ length }`/`{ maxLength }` size descriptors; only the None-serialization path inspects it.
    public readonly size: unknown,
  ) {}

  /**
   * Wrap a present value.
   *
   * @example
   * ```ts
   * return Option.some(values);
   * ```
   */
  static some<T>(value: T): Option<T> {
    return new Option<T>(value, undefined);
  }

  /**
   * Construct an absent Option.
   *
   * When serialized back to ACVM, the `None` case must produce the same number of fields as `Some`. For an inner type whose
   * wire size varies per call site (`BoundedVec`, an array), pass a `size` descriptor so the inner type's shape can
   * resolve how many zero fields to emit; fixed-size inners take no argument.
   *
   * @example None for a fixed-size type:
   * ```ts
   * return Option.none();
   * ```
   *
   * @example None for a dynamic-size type:
   * ```ts
   * return Option.none({ maxLength: ciphertext.maxLength });
   * ```
   */
  static none<T>(size?: unknown): Option<T> {
    return new Option<T>(undefined, size);
  }

  /**
   * Type guard: narrows `value` to `T` in the truthy branch.
   *
   * @example
   * ```ts
   * const opt = await handler.getSenderForTags();
   * if (opt.isSome()) {
   *   console.log(opt.value); // narrowed to T
   * }
   * ```
   */
  isSome(): this is Option<T> & { value: T } {
    return this.value !== undefined;
  }

  /** Type guard: narrows `value` to `undefined` in the truthy branch. */
  isNone(): this is Option<T> & { value: undefined } {
    return this.value === undefined;
  }

  equals(other: Option<T>, innerEquals: (a: T, b: T) => boolean): boolean {
    if (this.isSome() && other.isSome()) {
      return innerEquals(this.value, other.value);
    }
    return this.isNone() && other.isNone();
  }
}
