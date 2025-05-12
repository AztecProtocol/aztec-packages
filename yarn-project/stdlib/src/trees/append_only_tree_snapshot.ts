import type { ViemAppendOnlyTreeSnapshot } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { inspect } from 'util';
import { z } from 'zod';

import type { UInt32 } from '../types/shared.js';

/**
 * Snapshot of an append only tree.
 *
 * Used in circuits to verify that tree insertions are performed correctly.
 */
export class AppendOnlyTreeSnapshot {
  constructor(
    /**
     * Root of the append only tree when taking the snapshot.
     */
    public root: Fr,
    /**
     * Index of the next available leaf in the append only tree.
     *
     * Note: We include the next available leaf index in the snapshot so that the snapshot can be used to verify that
     *       the insertion was performed at the correct place. If we only verified tree root then it could happen that
     *       some leaves would get overwritten and the tree root check would still pass.
     *       TLDR: We need to store the next available leaf index to ensure that the "append only" property was
     *             preserved when verifying state transitions.
     */
    public nextAvailableLeafIndex: UInt32,
  ) {}

  static get schema() {
    return z
      .object({
        root: schemas.Fr,
        nextAvailableLeafIndex: schemas.UInt32,
      })
      .transform(({ root, nextAvailableLeafIndex }) => new AppendOnlyTreeSnapshot(root, nextAvailableLeafIndex));
  }

  getSize() {
    return this.root.size + 4;
  }

  toBuffer() {
    return serializeToBuffer(this.root, this.nextAvailableLeafIndex);
  }

  toFields(): Fr[] {
    return [this.root, new Fr(this.nextAvailableLeafIndex)];
  }

  toString(): string {
    return bufferToHex(this.toBuffer());
  }

  static fromBuffer(buffer: Buffer | BufferReader): AppendOnlyTreeSnapshot {
    const reader = BufferReader.asReader(buffer);
    return new AppendOnlyTreeSnapshot(Fr.fromBuffer(reader), reader.readNumber());
  }

  static fromString(str: string): AppendOnlyTreeSnapshot {
    return AppendOnlyTreeSnapshot.fromBuffer(hexToBuffer(str));
  }

  static fromFields(fields: Fr[] | FieldReader): AppendOnlyTreeSnapshot {
    const reader = FieldReader.asReader(fields);

    return new AppendOnlyTreeSnapshot(reader.readField(), Number(reader.readField().toBigInt()));
  }

  static fromViem(snapshot: ViemAppendOnlyTreeSnapshot) {
    return new AppendOnlyTreeSnapshot(Fr.fromString(snapshot.root), snapshot.nextAvailableLeafIndex);
  }

  toViem(): ViemAppendOnlyTreeSnapshot {
    return {
      root: this.root.toString(),
      nextAvailableLeafIndex: this.nextAvailableLeafIndex,
    };
  }

  toAbi(): [`0x${string}`, number] {
    return [this.root.toString(), this.nextAvailableLeafIndex];
  }

  static zero() {
    return new AppendOnlyTreeSnapshot(Fr.ZERO, 0);
  }

  isZero(): boolean {
    return this.root.isZero() && this.nextAvailableLeafIndex === 0;
  }

  [inspect.custom]() {
    return `AppendOnlyTreeSnapshot { root: ${this.root.toString()}, nextAvailableLeafIndex: ${
      this.nextAvailableLeafIndex
    } }`;
  }

  public equals(other: this) {
    return this.root.equals(other.root) && this.nextAvailableLeafIndex === other.nextAvailableLeafIndex;
  }

  static random() {
    return new AppendOnlyTreeSnapshot(Fr.random(), Math.floor(Math.random() * 1000));
  }
}
