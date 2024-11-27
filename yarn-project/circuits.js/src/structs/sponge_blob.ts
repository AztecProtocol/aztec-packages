import { type FieldsOf, makeTuple } from '@aztec/foundation/array';
import { poseidon2Permutation } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import {
  BufferReader,
  FieldReader,
  type Tuple,
  serializeToBuffer,
  serializeToFields,
} from '@aztec/foundation/serialize';

/**
 * A Poseidon2 sponge used to accumulate data that will be added to a blob.
 * See noir-projects/noir-protocol-circuits/crates/types/src/abis/sponge_blob.nr.
 */
export class SpongeBlob {
  constructor(
    /** Sponge with absorbed tx effects that will go into a blob. */
    public readonly sponge: Poseidon2Sponge,
    /** Number of effects absorbed so far. */
    public fields: number,
    /** Number of effects that will be absorbed. */
    public readonly expectedFields: number,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader): SpongeBlob {
    const reader = BufferReader.asReader(buffer);
    return new SpongeBlob(reader.readObject(Poseidon2Sponge), reader.readNumber(), reader.readNumber());
  }

  toBuffer() {
    return serializeToBuffer(this.sponge, this.fields, this.expectedFields);
  }

  static getFields(fields: FieldsOf<SpongeBlob>) {
    return [fields.sponge, fields.fields, fields.expectedFields];
  }

  toFields(): Fr[] {
    return serializeToFields(...SpongeBlob.getFields(this));
  }

  static fromFields(fields: Fr[] | FieldReader): SpongeBlob {
    const reader = FieldReader.asReader(fields);
    return new SpongeBlob(
      reader.readObject(Poseidon2Sponge),
      reader.readField().toNumber(),
      reader.readField().toNumber(),
    );
  }

  clone() {
    return SpongeBlob.fromBuffer(this.toBuffer());
  }

  absorb(fields: Fr[]) {
    if (this.fields + fields.length > this.expectedFields) {
      throw new Error(
        `Attempted to fill spongeblob with ${this.fields + fields.length}, but it has a max of ${this.expectedFields}`,
      );
    }
    this.sponge.absorb(fields);
    this.fields += fields.length;
  }

  squeeze(): Fr {
    // If the blob sponge is not 'full', we append 1 to match Poseidon2::hash_internal()
    // NB: There is currently no use case in which we don't 'fill' a blob sponge, but adding for completeness
    if (this.fields != this.expectedFields) {
      this.sponge.absorb([Fr.ONE]);
    }
    return this.sponge.squeeze();
  }

  static empty(): SpongeBlob {
    return new SpongeBlob(Poseidon2Sponge.empty(), 0, 0);
  }

  static init(expectedFields: number): SpongeBlob {
    return new SpongeBlob(Poseidon2Sponge.init(expectedFields), 0, expectedFields);
  }
}

// This is just noir's stdlib version of the poseidon2 sponge. We use it for a blob-specific implmentation of the hasher.
export class Poseidon2Sponge {
  constructor(
    public cache: Tuple<Fr, 3>,
    public state: Tuple<Fr, 4>,
    public cacheSize: number,
    public squeezeMode: boolean,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader): Poseidon2Sponge {
    const reader = BufferReader.asReader(buffer);
    return new Poseidon2Sponge(
      reader.readArray(3, Fr),
      reader.readArray(4, Fr),
      reader.readNumber(),
      reader.readBoolean(),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.cache, this.state, this.cacheSize, this.squeezeMode);
  }

  static getFields(fields: FieldsOf<Poseidon2Sponge>) {
    return [fields.cache, fields.state, fields.cacheSize, fields.squeezeMode];
  }

  toFields(): Fr[] {
    return serializeToFields(...Poseidon2Sponge.getFields(this));
  }

  static fromFields(fields: Fr[] | FieldReader): Poseidon2Sponge {
    const reader = FieldReader.asReader(fields);
    return new Poseidon2Sponge(
      reader.readFieldArray(3),
      reader.readFieldArray(4),
      reader.readField().toNumber(),
      reader.readBoolean(),
    );
  }

  static empty(): Poseidon2Sponge {
    return new Poseidon2Sponge(
      makeTuple(3, () => Fr.ZERO),
      makeTuple(4, () => Fr.ZERO),
      0,
      false,
    );
  }

  static init(expectedFields: number): Poseidon2Sponge {
    const iv = new Fr(expectedFields).mul(new Fr(BigInt('18446744073709551616')));
    const sponge = Poseidon2Sponge.empty();
    sponge.state[3] = iv;
    return sponge;
  }

  // Note: there isn't currently an impl in ts that allows for a custom aborption via an
  // existing sponge.
  // A custom blob-based impl of noir/noir-repo/noir_stdlib/src/hash/poseidon2.nr
  performDuplex() {
    for (let i = 0; i < this.cache.length; i++) {
      if (i < this.cacheSize) {
        this.state[i] = this.state[i].add(this.cache[i]);
      }
    }
    const perm = poseidon2Permutation(this.state);
    // ts doesn't understand that the above always gives 4
    this.state = [perm[0], perm[1], perm[2], perm[3]];
  }

  absorb(fields: Fr[]) {
    if (this.squeezeMode) {
      throw new Error(`Poseidon sponge is not able to absorb more inputs.`);
    }
    fields.forEach(field => {
      if (this.cacheSize == this.cache.length) {
        this.performDuplex();
        this.cache[0] = field;
        this.cacheSize = 1;
      } else {
        this.cache[this.cacheSize++] = field;
      }
    });
  }

  squeeze(): Fr {
    if (this.squeezeMode) {
      throw new Error(`Poseidon sponge has already been squeezed.`);
    }
    this.performDuplex();
    this.squeezeMode = true;
    return this.state[0];
  }
}
