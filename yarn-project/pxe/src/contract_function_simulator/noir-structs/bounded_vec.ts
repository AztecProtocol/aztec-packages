/**
 * TypeScript counterpart of Noir's `BoundedVec<T, MaxLen>`.
 *
 * Carries the actual `data` plus `maxLength` so the ACVM serializer can pad the storage slot to `maxLength` elements.
 * `elementSize` is only needed when an element's wire width can't be derived from its mapping shape (a variable-width
 * element such as a packed note); for fixed-width elements the serializer takes the width from the shape and ignores it.
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
   * @param maxLength - Maximum capacity declared at the Noir call site. The storage slot is padded to this many
   *   elements.
   * @param elementSize - Number of Fr fields each element contributes when serialized. Only consulted for
   *   variable-width elements whose width isn't statically known from their shape (e.g. a packed note spanning
   *   `packedHintedNoteLength` fields); fixed-width elements derive it from the shape, so it can be omitted.
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

  equals(other: BoundedVec<T>, innerEquals: (a: T, b: T) => boolean): boolean {
    return (
      this.maxLength === other.maxLength &&
      this.data.length === other.data.length &&
      this.data.every((value, i) => innerEquals(value, other.data[i]))
    );
  }
}
