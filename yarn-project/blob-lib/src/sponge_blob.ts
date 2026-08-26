import { BLOBS_PER_CHECKPOINT, FIELDS_PER_BLOB, TWO_POW_64 } from '@aztec/constants';
import { type FieldsOf, makeTuple } from '@aztec/foundation/array';
import { poseidon2AbsorbChain, poseidon2Permutation } from '@aztec/foundation/crypto/poseidon';
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
 * See noir-projects/fnd/noir-protocol-circuits/crates/types/src/blob_data/sponge_blob.nr.
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
    // This must match the implementation in noir-projects/fnd/noir-protocol-circuits/crates/types/src/blob_data/sponge_blob.nr
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
    // Bail out early if nothing to absorb
    if (fields.length === 0) {
      return;
    }
    // Instead of calling out to bb.js per duplex, send out an array of chunks of 3 field elements
    // to the poseidon2AbsorbChain call. For larger arrays this saves significant communication overhead.
    // However, since it only works on chunks of 3, we track any additional fields that we need to "fix up" at the end.

    // This is the total number of elements that need to be absorbed (what was remaining in the cache and new incoming inputs)
    const total = this.cacheSize + fields.length;
    // The number of fields that comprise our chunks of 3 we can send to the poseidon2AbsorbChain
    // We do (total - 1) since we do 1 less duplex round in this function if total % 3 == 0. I.e. if the cache is full at
    // the end we leave it that way for a final squeeze function
    const numChunkedFields = Math.floor((total - 1) / 3) * 3;
    if (numChunkedFields === 0) {
      // What we absorbed and what was in the cache wasn't enough to induce a duplex round.
      // So we just add to the cache
      for (const field of fields) {
        this.cache[this.cacheSize++] = field;
      }
      return;
    }

    // We got stuff we want to duplex
    const chain: Fr[] = new Array(numChunkedFields);
    // Copy the elements from the cache
    for (let i = 0; i < this.cacheSize; i++) {
      chain[i] = this.cache[i];
    }
    // Copy the input elements that will round out the chunks of 3 that will be absorbed
    for (let i = this.cacheSize; i < numChunkedFields; i++) {
      chain[i] = fields[i - this.cacheSize];
    }
    const state = await poseidon2AbsorbChain(this.state, chain);
    // ts doesn't understand that the above always gives 4
    this.state = [state[0], state[1], state[2], state[3]];
    // Place the remaining 1..3 fields into the cache.
    const remaining = total - numChunkedFields;
    for (let i = 0; i < remaining; i++) {
      this.cache[i] = fields[fields.length - remaining + i];
    }
    this.cacheSize = remaining;
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
