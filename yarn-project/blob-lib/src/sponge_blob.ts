import { TWO_POW_64 } from '@aztec/constants';
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
 * A Poseidon2 sponge used to accumulate data that will be added to blobs.
 * See noir-projects/noir-protocol-circuits/crates/types/src/abis/sponge_blob.nr.
 */
export class SpongeBlob {
  constructor(
    /** Sponge with absorbed fields that will go into one or more blobs. */
    public readonly sponge: Poseidon2Sponge,
    /** Number of effects absorbed so far. */
    public numAbsorbedFields: number,
    /** Number of effects that will be absorbed. */
    public readonly numExpectedFields: number,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader): SpongeBlob {
    const reader = BufferReader.asReader(buffer);
    return new SpongeBlob(reader.readObject(Poseidon2Sponge), reader.readNumber(), reader.readNumber());
  }

  toBuffer() {
    return serializeToBuffer(...SpongeBlob.getFields(this));
  }

  static getFields(fields: FieldsOf<SpongeBlob>) {
    return [fields.sponge, fields.numAbsorbedFields, fields.numExpectedFields];
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

  async absorb(fields: Fr[]) {
    if (this.numAbsorbedFields + fields.length > this.numExpectedFields) {
      throw new Error(
        `Attempted to fill spongeBlob with ${this.numAbsorbedFields + fields.length}, but it has a max of ${this.numExpectedFields}`,
      );
    }
    await this.sponge.absorb(fields);
    this.numAbsorbedFields += fields.length;
  }

  async squeeze(): Promise<Fr> {
    // If the blob sponge is not 'full', we append 1 to match Poseidon2::hash_internal()
    // NB: There is currently no use case in which we don't 'fill' a blob sponge, but adding for completeness
    if (this.numAbsorbedFields != this.numExpectedFields) {
      await this.sponge.absorb([Fr.ONE]);
    }
    return this.sponge.squeeze();
  }

  static empty(): SpongeBlob {
    return new SpongeBlob(Poseidon2Sponge.empty(), 0, 0);
  }

  /**
   * Initialize the sponge blob with the number of expected fields in the checkpoint and absorb it as the first field.
   * Note: `numExpectedFields` includes the first field absorbed in this method.
   */
  static async init(numExpectedFields: number): Promise<SpongeBlob> {
    // This must match what the checkpoint root rollup circuit expects.
    // See noir-projects/noir-protocol-circuits/types/src/abis/sponge_blob.nr -> init_for_checkpoint.
    const sponge = Poseidon2Sponge.init(numExpectedFields);
    await sponge.absorb([new Fr(numExpectedFields)]);
    const numAbsorbedFields = 1;
    return new SpongeBlob(sponge, numAbsorbedFields, numExpectedFields);
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

  static init(numExpectedFields: number): Poseidon2Sponge {
    const iv = new Fr(numExpectedFields).mul(new Fr(TWO_POW_64));
    const sponge = Poseidon2Sponge.empty();
    sponge.state[3] = iv;
    return sponge;
  }

  // Note: there isn't currently an impl in ts that allows for a custom aborption via an
  // existing sponge.
  // A custom blob-based impl of noir/noir-repo/noir_stdlib/src/hash/poseidon2.nr
  async performDuplex() {
    for (let i = 0; i < this.cache.length; i++) {
      if (i < this.cacheSize) {
        this.state[i] = this.state[i].add(this.cache[i]);
      }
    }
    const perm = await poseidon2Permutation(this.state);
    // ts doesn't understand that the above always gives 4
    this.state = [perm[0], perm[1], perm[2], perm[3]];
  }

  async absorb(fields: Fr[]) {
    if (this.squeezeMode) {
      throw new Error(`Poseidon sponge is not able to absorb more inputs.`);
    }
    for (const field of fields) {
      if (this.cacheSize == this.cache.length) {
        await this.performDuplex();
        this.cache[0] = field;
        this.cacheSize = 1;
      } else {
        this.cache[this.cacheSize++] = field;
      }
    }
  }

  async squeeze(): Promise<Fr> {
    if (this.squeezeMode) {
      throw new Error(`Poseidon sponge has already been squeezed.`);
    }
    await this.performDuplex();
    this.squeezeMode = true;
    return this.state[0];
  }
}
