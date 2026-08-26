import { Poseidon2Sponge } from '@aztec/blob-lib/types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { type InboxMessageBundle, bucketStartsOf, flattenBundle } from './inbox_message_bundle.js';

/**
 * Weight the bucket-start flag is packed at, just above a message leaf's 248 bits, and so also the exclusive upper
 * bound on a leaf. Leaves are `sha256ToField` outputs (a sha256 digest with its last byte dropped) and always fit.
 */
const BUCKET_START_SHIFT = 1n << 248n;

/**
 * Packs a message leaf with its bucket-start flag into the single field the sponge absorbs.
 * @throws If the leaf does not fit below the flag's weight, which would make the packing ambiguous.
 */
function packLeaf(leaf: Fr, bucketStart: boolean): Fr {
  const value = leaf.toBigInt();
  if (value >= BUCKET_START_SHIFT) {
    throw new Error(`L1-to-L2 message leaf ${leaf} does not fit in 248 bits`);
  }
  return bucketStart ? new Fr(value + BUCKET_START_SHIFT) : leaf;
}

/**
 * An absorb-only Poseidon2 sponge over L1-to-L2 message leaves and their bucket-start flags.
 *
 * Mirrors `L1ToL2MessageSponge` in
 * `noir-projects/fnd/noir-protocol-circuits/crates/rollup-lib/src/abis/l1_to_l2_message_sponge.nr`. Each block of a
 * checkpoint absorbs its message bundle into the sponge it inherited from the previous block; the checkpoint root
 * recomputes the sponge over the checkpoint's whole message list and asserts the accumulated states are equal. Each
 * leaf is absorbed as one field carrying its bucket-start flag above it, so a block that starts consuming mid-bucket
 * reaches a different state than the checkpoint's own grouping and the equality check fails.
 */
export class L1ToL2MessageSponge {
  constructor(
    /** Sponge accumulating the absorbed message leaves. */
    public readonly sponge: Poseidon2Sponge,
    /** Number of message leaves absorbed so far, which is also the number of absorbed fields. */
    public numAbsorbed: number,
  ) {}

  /** A fresh, empty sponge (matching noir's `L1ToL2MessageSponge::new()` / `empty()`, i.e. `Poseidon2Sponge::new(0)`). */
  static empty(): L1ToL2MessageSponge {
    return new L1ToL2MessageSponge(Poseidon2Sponge.empty(), 0);
  }

  /**
   * Absorb the given message leaves in order, one field per leaf: the leaf with its bucket-start flag packed above it.
   * @throws If the flags are not aligned one-to-one with the leaves, or a leaf does not fit in 248 bits.
   */
  async absorb(leaves: Fr[], bucketStarts: boolean[]) {
    if (leaves.length !== bucketStarts.length) {
      throw new Error(`Expected ${leaves.length} bucket-start flags but got ${bucketStarts.length}`);
    }
    await this.sponge.absorb(leaves.map((leaf, index) => packLeaf(leaf, bucketStarts[index])));
    this.numAbsorbed += leaves.length;
  }

  clone() {
    return L1ToL2MessageSponge.fromBuffer(this.toBuffer());
  }

  static getFields(fields: FieldsOf<L1ToL2MessageSponge>) {
    return [fields.sponge, fields.numAbsorbed] as const;
  }

  toBuffer() {
    return serializeToBuffer(...L1ToL2MessageSponge.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader): L1ToL2MessageSponge {
    const reader = BufferReader.asReader(buffer);
    return new L1ToL2MessageSponge(reader.readObject(Poseidon2Sponge), reader.readNumber());
  }

  toFields(): Fr[] {
    return serializeToFields(...L1ToL2MessageSponge.getFields(this));
  }

  static fromFields(fields: Fr[] | FieldReader): L1ToL2MessageSponge {
    const reader = FieldReader.asReader(fields);
    return new L1ToL2MessageSponge(reader.readObject(Poseidon2Sponge), reader.readField().toNumber());
  }
}

/**
 * Accumulates a fresh message sponge over a bundle's leaves and bucket boundaries, in order. This is the value the
 * inbox parity proof commits to and the checkpoint's block roots reach, starting from the empty sponge.
 */
export async function accumulateL1ToL2MessageSponge(bundle: InboxMessageBundle): Promise<L1ToL2MessageSponge> {
  const sponge = L1ToL2MessageSponge.empty();
  await sponge.absorb(flattenBundle(bundle), bucketStartsOf(bundle));
  return sponge;
}
