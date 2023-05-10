import { Fq, Fr } from '@aztec/foundation/fields';
import { serializeToBuffer } from '../utils/serialize.js';
import times from 'lodash.times';
import { Vector, UInt32, AffineElement } from './shared.js';
import { BufferReader } from '@aztec/foundation/serialize';

export class AggregationObject {
  constructor(
    public p0: AffineElement,
    public p1: AffineElement,
    public publicInputs: Fr[],
    public proofWitnessIndices: UInt32[],
    public hasData = false,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.p0,
      this.p1,
      new Vector(this.publicInputs),
      new Vector(this.proofWitnessIndices),
      this.hasData,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): AggregationObject {
    const reader = BufferReader.asReader(buffer);
    return new AggregationObject(
      reader.readObject(AffineElement),
      reader.readObject(AffineElement),
      reader.readVector(Fr),
      reader.readNumberVector(),
      reader.readBoolean(),
    );
  }

  static makeFake() {
    return new AggregationObject(
      new AffineElement(new Fq(1n), new Fq(2n)),
      new AffineElement(new Fq(1n), new Fq(2n)),
      [],
      times(16, i => 3027 + i),
      false,
    );
  }
}
