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
    public readonly template: T | undefined,
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
   * When serialized back to ACVM, the `None` case must produce the same number of fields as `Some`.
   * For types whose wire size varies per call site (`BoundedVec`, `FixedArray`), pass a `template` so the
   * serializer knows how many zero fields to emit. Omit the template when the Option will not be
   * re-serialized (e.g. deserialized input params).
   *
   * @param template - A representative empty `T` whose serialization determines the zero-filled wire format.
   *
   * @example None for a fixed-size type:
   * ```ts
   * return Option.none(AztecAddress.ZERO);
   * ```
   *
   * @example None for a dynamic-size type:
   * ```ts
   * return Option.none(BoundedVec.empty<number>({ maxLength: ciphertext.maxLength }));
   * ```
   */
  static none<T>(template?: T): Option<T> {
    return new Option<T>(undefined, template);
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
