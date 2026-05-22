/**
 * TypeScript counterpart of Noir's `[T; N]` (fixed-size array).
 *
 * Carries the `data` plus its declared `size` so the ACVM serializer zero-pads to exactly N fields.
 * Unlike {@link BoundedVec}, there is no separate length slot — the wire format is always exactly `size` elements.
 */
export class FixedArray<T> {
  private constructor(
    public readonly data: ArrayLike<T>,
    public readonly size: number,
  ) {}

  /**
   * Construct a FixedArray with data.
   *
   * The `size` typically comes from a Noir input param that declares the array length at the call site
   *
   * @param data - Actual elements. Padded with zeros up to `size` at serialization time.
   * @param size - Declared array length from the Noir call site.
   *
   * @example
   * ```ts
   * return values
   *   ? Option.some(FixedArray.from({ data: values, size: tSize }))
   *   : Option.empty(FixedArray.empty({ size: tSize }));
   * ```
   */
  static from<T>({ data, size }: { data: ArrayLike<T>; size: number }): FixedArray<T> {
    return new FixedArray<T>(data, size);
  }

  /**
   * Construct an empty FixedArray, typically used as a shape template for `Option.empty(...)`.
   *
   * @param size - Declared array length from the Noir call site.
   *
   * @example
   * ```ts
   * Option.empty(FixedArray.empty({ size: tSize }))
   * ```
   */
  static empty<T>({ size }: { size: number }): FixedArray<T> {
    return new FixedArray<T>([], size);
  }
}
