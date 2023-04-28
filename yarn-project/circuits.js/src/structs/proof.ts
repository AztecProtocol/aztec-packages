export class Proof {
  constructor(public buffer: Buffer) {}
  static fromBuffer(buffer: Buffer): Proof {
    return new this(buffer);
  }
  public toBuffer() {
    return this.buffer;
  }
}
