import { Poseidon2Sponge } from '@aztec/blob-lib/types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

/**
 * An absorb-only Poseidon2 sponge over L1-to-L2 message leaves.
 *
 * Mirrors `L1ToL2MessageSponge` in
 * `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/abis/l1_to_l2_message_sponge.nr`. Each block of a
 * checkpoint absorbs its message bundle into the sponge it inherited from the previous block; the checkpoint root
 * recomputes the sponge over the checkpoint's whole message list and asserts the accumulated states are equal.
 */
export class L1ToL2MessageSponge {
  constructor(
    /** Sponge accumulating the absorbed message leaves. */
    public readonly sponge: Poseidon2Sponge,
    /** Number of message leaves absorbed so far. */
    public numAbsorbed: number,
  ) {}

  /** A fresh, empty sponge (matching noir's `L1ToL2MessageSponge::new()` / `empty()`, i.e. `Poseidon2Sponge::new(0)`). */
  static empty(): L1ToL2MessageSponge {
    return new L1ToL2MessageSponge(Poseidon2Sponge.empty(), 0);
  }

  /** Absorb the given message leaves in order. */
  async absorb(leaves: Fr[]) {
    await this.sponge.absorb(leaves);
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
 * Accumulates a fresh message sponge over `leaves`, in order. This is the value the inbox parity proof commits to and
 * the checkpoint's block roots reach, starting from the empty sponge. Every leaf passed in is absorbed, so any padding
 * the caller includes is part of the accumulated state.
 */
export async function accumulateL1ToL2MessageSponge(leaves: Fr[]): Promise<L1ToL2MessageSponge> {
  const sponge = L1ToL2MessageSponge.empty();
  await sponge.absorb(leaves);
  return sponge;
}
