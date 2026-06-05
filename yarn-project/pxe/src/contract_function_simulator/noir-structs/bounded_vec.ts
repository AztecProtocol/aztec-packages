/**
 * TypeScript counterpart of Noir's `BoundedVec<T, MaxLen>`.
 *
 * Carries the actual `data` plus wire-format metadata (`maxLength`, `elementSize`) so the ACVM
 * serializer can pad the storage slot to exactly `maxLength * elementSize` fields.
 */
export class BoundedVec<T> {
  private constructor(
    public readonly data: T[],
    public readonly maxLength: number,
    public readonly elementSize: number,
  ) {}

  /**
   * Construct a BoundedVec with data.
   *
   * @param data - Actual elements. Length must be `<= maxLength`.
   * @param maxLength - Maximum capacity declared at the Noir call site.
   *   The storage slot is padded to this many elements.
   * @param elementSize - Number of Fr fields each element contributes when serialized.
   *   `1` for scalar elements (u8, Field) — this is the default.
   *   `> 1` for compound elements (e.g. a packed note that spans multiple fields).
   *
   * @example A bounded vec of bytes (elementSize defaults to 1):
   * ```ts
   * BoundedVec.from({ data: plaintext, maxLength: ciphertext.maxLength })
   * ```
   *
   * @example A bounded vec of packed notes, each spanning `packedHintedNoteLength` fields:
   * ```ts
   * BoundedVec.from({ data: notes, maxLength: maxNotes, elementSize: packedHintedNoteLength })
   * ```
   */
  static from<T>({
    data,
    maxLength,
    elementSize = 1,
  }: {
    data: T[];
    maxLength: number;
    elementSize?: number;
  }): BoundedVec<T> {
    return new BoundedVec<T>(data, maxLength, elementSize);
  }

  /**
   * Construct an empty BoundedVec, typically used as a shape template for `Option.empty(...)`.
   *
   * @param maxLength - Maximum capacity declared at the Noir call site.
   * @param elementSize - Number of Fr fields each element contributes when serialized (default 1).
   */
  static empty<T>({ maxLength, elementSize = 1 }: { maxLength: number; elementSize?: number }): BoundedVec<T> {
    return new BoundedVec<T>([], maxLength, elementSize);
  }
}
