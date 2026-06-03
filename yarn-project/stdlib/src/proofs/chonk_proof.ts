import { BarretenbergSync, flattenChonkProofFields } from '@aztec/bb.js';
import { CHONK_PROOF_LENGTH } from '@aztec/constants';
import { times } from '@aztec/foundation/collection';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, BufferSink } from '@aztec/foundation/serialize';

/**
 * Serialization format detection for ChonkProof is value-based on the leading uint32:
 *   - EMPTY:                 [0: uint32]                              → total = 4 bytes
 *   - UNCOMPRESSED (legacy): [field_count=1632: uint32] [fields...]  → total ≈ 52KB (>= 40KB)
 *   - COMPRESSED:            [byte_count: uint32] [compressed_bytes] → total ≈ 35KB (< 40KB)
 *
 * Detection from the first uint32: 0 means an empty proof (no fields); CHONK_PROOF_LENGTH
 * (1632) means legacy format (field count); any other value is the compressed byte count.
 * A real compressed proof always has a non-zero byte count, so 0 is an unambiguous sentinel
 * for the empty case. The old uncompressed format is never smaller than 40KB; compressed
 * proofs are always smaller than 40KB.
 */

// CHONK: "Client Honk" - An UltraHonk variant with incremental folding and delayed non-native arithmetic.
export class ChonkProof {
  /**
   * Optional compressed proof bytes from chonk compression (point compression + u256 encoding).
   * When set, toBuffer() will serialize in compressed format (~1.7x smaller).
   * When reading from compressed format, this is populated and fields are decompressed on demand.
   */
  public compressedProof?: Buffer;

  constructor(
    // The proof fields.
    // For native verification, attach public inputs via `attachPublicInputs(publicInputs)`.
    // Not using Tuple here due to the length being too high.
    public fields: Fr[],
    compressedProof?: Buffer,
  ) {
    // An empty proof (no fields) is a valid placeholder; see ChonkProof.empty().
    if (fields.length !== 0 && fields.length !== CHONK_PROOF_LENGTH) {
      throw new Error(`Invalid ChonkProof length: ${fields.length}`);
    }
    this.compressedProof = compressedProof;
  }

  public attachPublicInputs(publicInputs: Fr[]) {
    return new ChonkProofWithPublicInputs([...publicInputs, ...this.fields]);
  }

  public isEmpty() {
    return this.fields.every(field => field.isZero());
  }

  static empty() {
    return new ChonkProof([]);
  }

  static random() {
    // NB: Not using Fr.random here because it slows down some tests that require a large number of txs significantly.
    // NB2: generate one fewer random bytes to not have to deal with buffers representing numbers greater than the field modulus
    // NB3: a chonk proof can be compressed. Simulate this by filling 1/4 of the proof with zero data
    const reducedFrSize = Fr.SIZE_IN_BYTES - 1;
    const nonZeroFields = Math.floor((3 * CHONK_PROOF_LENGTH) / 4);
    const randomFields = randomBytes(nonZeroFields * Fr.SIZE_IN_BYTES);
    const proof = [
      ...times(nonZeroFields, i => new Fr(randomFields.subarray(i * reducedFrSize, (i + 1) * reducedFrSize))),
      ...times(CHONK_PROOF_LENGTH - nonZeroFields, () => Fr.ZERO),
    ];
    return new ChonkProof(proof);
  }

  static get schema() {
    return bufferSchemaFor(ChonkProof);
  }

  // We use this in tandem with the bufferSchemaFor to serialize to base64 strings.
  toJSON() {
    return this.toBuffer();
  }

  /**
   * Deserialize a ChonkProof from a buffer.
   * Supports both legacy (field elements) and compressed (chonk compression) formats.
   *
   * Value-based format detection on the leading uint32:
   *   - First uint32 == 0: empty proof (no fields), total = 4 bytes
   *   - First uint32 == CHONK_PROOF_LENGTH (1632): legacy format, read field elements
   *     Total proof data ≈ 52KB (always >= 40KB)
   *   - Otherwise: compressed format, first uint32 is byte count of compressed data
   *     Total proof data ≈ 35KB (always < 40KB)
   */
  static fromBuffer(buffer: Buffer | BufferReader): ChonkProof {
    const reader = BufferReader.asReader(buffer);
    const firstUint32 = reader.readNumber();

    if (firstUint32 === 0) {
      // Empty format: a zero length encodes an empty proof.
      return ChonkProof.empty();
    }

    if (firstUint32 === CHONK_PROOF_LENGTH) {
      // Legacy format: firstUint32 is the field count (1632)
      // Widen to `number` to prevent TS from narrowing to literal 1632,
      // which would cause Tuple<Fr, 1632> to exceed the recursion limit.
      const fieldCount: number = firstUint32;
      const proof = reader.readArray(fieldCount, Fr);
      return new ChonkProof(proof);
    }

    // Compressed format: firstUint32 is the compressed byte count
    const compressedBytes = reader.readBytes(firstUint32);
    return ChonkProof.fromCompressedBytes(Buffer.from(compressedBytes));
  }

  /**
   * Create a ChonkProof from compressed bytes by decompressing via the BarretenbergSync API.
   * The compressed format uses point compression and u256 encoding (from PR #20645).
   *
   * @param compressed - Compressed proof bytes from chonk compression
   * @returns ChonkProof with both fields and compressed bytes populated
   */
  static fromCompressedBytes(compressed: Buffer): ChonkProof {
    const api = BarretenbergSync.getSingleton();
    const result = api.chonkDecompressProof({ compressedProof: new Uint8Array(compressed) });

    // Flatten the structured bb.js ChonkProof into flat Fr[] field elements
    const flatFields = flattenChonkProofFields(result.proof);
    const fields = flatFields.map(f => Fr.fromBuffer(Buffer.from(f)));

    // The decompressed proof includes public inputs in hidingOinkProof.
    // Since ChonkProof stores fields WITHOUT public inputs, strip them.
    // The number of public inputs = total fields - CHONK_PROOF_LENGTH
    if (fields.length > CHONK_PROOF_LENGTH) {
      const numPubInputs = fields.length - CHONK_PROOF_LENGTH;
      const proofFields = fields.slice(numPubInputs);
      return new ChonkProof(proofFields, compressed);
    }

    return new ChonkProof(fields, compressed);
  }

  /**
   * Serialize the proof to a buffer.
   * If compressed bytes are available, uses the compressed format (~1.7x smaller).
   * Otherwise falls back to legacy field element format.
   */
  public toBuffer(): Buffer;
  public toBuffer(sink: BufferSink): void;
  public toBuffer(sink?: BufferSink): Buffer | void {
    if (!sink) {
      return BufferSink.serialize(this);
    }
    if (this.compressedProof) {
      // Compressed format: [compressed_byte_count: uint32] [compressed_bytes]
      sink.writeNumber(this.compressedProof.length);
      sink.writeBytes(this.compressedProof);
      return;
    }
    // Legacy / empty format: [field_count: uint32] [fields...]. fields.length === 0 emits the empty
    // sentinel (a lone zero uint32) that ChonkProof.fromBuffer detects; fields.length === CHONK_PROOF_LENGTH
    // is the full legacy form. The writeFields fast path skips per-element sinkable dispatch on the 1632
    // leaves and is a no-op when the array is empty.
    sink.writeNumber(this.fields.length);
    sink.writeFields(this.fields);
  }
}

export class ChonkProofWithPublicInputs {
  /**
   * Optional compressed proof bytes (covers the full proof WITH public inputs).
   * Set by the prover when using chonk compression. Flows through to ChonkProof
   * via removePublicInputs() so the Tx can serialize in compressed format.
   */
  public compressedProof?: Buffer;

  constructor(
    // The proof fields with public inputs.
    // For recursive verification, use without public inputs via `removePublicInputs()`.
    public fieldsWithPublicInputs: Fr[],
  ) {
    // An empty proof (no fields) is a valid placeholder; see ChonkProofWithPublicInputs.empty().
    if (fieldsWithPublicInputs.length !== 0 && fieldsWithPublicInputs.length < CHONK_PROOF_LENGTH) {
      throw new Error(`Invalid ChonkProofWithPublicInputs length: ${fieldsWithPublicInputs.length}`);
    }
  }

  public getPublicInputs() {
    if (this.fieldsWithPublicInputs.length === 0) {
      return [];
    }
    const numPublicInputs = this.fieldsWithPublicInputs.length - CHONK_PROOF_LENGTH;
    return this.fieldsWithPublicInputs.slice(0, numPublicInputs);
  }

  public removePublicInputs() {
    if (this.fieldsWithPublicInputs.length === 0) {
      return new ChonkProof([], this.compressedProof);
    }
    const numPublicInputs = this.fieldsWithPublicInputs.length - CHONK_PROOF_LENGTH;
    // Flow compressed proof bytes through so the ChonkProof can serialize efficiently
    return new ChonkProof(this.fieldsWithPublicInputs.slice(numPublicInputs), this.compressedProof);
  }

  public isEmpty() {
    return this.fieldsWithPublicInputs.every(field => field.isZero());
  }

  static empty() {
    return ChonkProof.empty().attachPublicInputs([]);
  }

  static get schema() {
    return bufferSchemaFor(ChonkProofWithPublicInputs);
  }

  // We use this in tandem with the bufferSchemaFor to serialize to base64 strings.
  toJSON() {
    return this.toBuffer();
  }

  static fromBuffer(buffer: Buffer | BufferReader): ChonkProofWithPublicInputs {
    const reader = BufferReader.asReader(buffer);
    const proofLength = reader.readNumber();
    const proof = reader.readArray(proofLength, Fr);
    return new ChonkProofWithPublicInputs(proof);
  }

  public toBuffer(): Buffer;
  public toBuffer(sink: BufferSink): void;
  public toBuffer(sink?: BufferSink): Buffer | void {
    if (!sink) {
      return BufferSink.serialize(this);
    }
    sink.writeNumber(this.fieldsWithPublicInputs.length);
    sink.writeFields(this.fieldsWithPublicInputs);
  }

  // Called when constructing from bb proving results.
  static fromBufferArray(fields: Uint8Array[]): ChonkProofWithPublicInputs {
    const proof = fields.map(field => Fr.fromBuffer(Buffer.from(field)));
    return new ChonkProofWithPublicInputs(proof);
  }
}
