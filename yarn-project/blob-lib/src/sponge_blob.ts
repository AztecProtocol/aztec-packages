import { BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB, TWO_POW_64 } from '@aztec/constants';
import { type FieldsOf, makeTuple } from '@aztec/foundation/array';
import { poseidon2Permutation } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
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
  static MAX_FIELDS = BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB;

  constructor(
    /** Sponge with absorbed fields that will go into one or more blobs. */
    public readonly sponge: Poseidon2Sponge,
    /** Number of effects absorbed so far. */
    public numAbsorbedFields: number,
  ) {}

  /**
   * Initialize the sponge blob to absorb data for a checkpoint.
   */
  static init(): SpongeBlob {
    // This must match the implementation in noir-projects/noir-protocol-circuits/types/src/abis/sponge_blob.nr
    const iv = new Fr(BigInt(SpongeBlob.MAX_FIELDS) * TWO_POW_64);
    const sponge = Poseidon2Sponge.init(iv);
    return new SpongeBlob(sponge, 0);
  }

  static fromBuffer(buffer: Buffer | BufferReader): SpongeBlob {
    const reader = BufferReader.asReader(buffer);
    return new SpongeBlob(reader.readObject(Poseidon2Sponge), reader.readNumber());
  }

  toBuffer() {
    return serializeToBuffer(...SpongeBlob.getFields(this));
  }

  static getFields(fields: FieldsOf<SpongeBlob>) {
    return [fields.sponge, fields.numAbsorbedFields];
  }

  toFields(): Fr[] {
    return serializeToFields(...SpongeBlob.getFields(this));
  }

  static fromFields(fields: Fr[] | FieldReader): SpongeBlob {
    const reader = FieldReader.asReader(fields);
    return new SpongeBlob(reader.readObject(Poseidon2Sponge), reader.readField().toNumber());
  }

  clone() {
    return SpongeBlob.fromBuffer(this.toBuffer());
  }

  async absorb(fields: Fr[]) {
    if (this.numAbsorbedFields + fields.length > SpongeBlob.MAX_FIELDS) {
      throw new Error(
        `Attempted to fill spongeBlob with ${this.numAbsorbedFields + fields.length}, but it has a max of ${SpongeBlob.MAX_FIELDS}`,
      );
    }
    await this.sponge.absorb(fields);
    this.numAbsorbedFields += fields.length;
  }

  async squeeze(): Promise<Fr> {
    return await this.sponge.squeeze();
  }

  static empty(): SpongeBlob {
    return new SpongeBlob(Poseidon2Sponge.empty(), 0);
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

  static init(iv: Fr): Poseidon2Sponge {
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
