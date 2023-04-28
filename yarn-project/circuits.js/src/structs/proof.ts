export class Proof {
  // Make sure this type is not confused with other buffer wrappers
  readonly __proofBrand: any;
  constructor(public buffer: Buffer) {}
  static fromBuffer(buffer: Buffer): Proof {
    return new this(buffer);
  }
  public toBuffer() {
    return this.buffer;
  }
}
