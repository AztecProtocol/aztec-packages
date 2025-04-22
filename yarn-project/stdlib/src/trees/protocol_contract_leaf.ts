import { MAX_PROTOCOL_CONTRACTS } from '@aztec/constants';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader } from '@aztec/foundation/serialize';
import type { IndexedTreeLeaf, IndexedTreeLeafPreimage } from '@aztec/foundation/trees';

import { z } from 'zod';

/**
 * Class containing the data of a preimage of a single leaf in the protocol contract tree.
 * Note: It's called preimage because this data gets hashed before being inserted as a node into the `IndexedTree`.
 * Note: Though this tree contains addresses, they are converted to fields to avoid unnecessary conversions in the tree.
 */
export class ProtocolContractLeafPreimage implements IndexedTreeLeafPreimage {
  constructor(
    /**
     * Leaf value inside the indexed tree's linked list.
     */
    public address: Fr,
    /**
     * Next value inside the indexed tree's linked list.
     */
    public nextAddress: Fr,
    /**
     * Index of the next leaf in the indexed tree's linked list.
     */
    public nextIndex: bigint,
  ) {}

  static get schema() {
    return z
      .object({
        address: schemas.Fr,
        nextAddress: schemas.Fr,
        nextIndex: schemas.BigInt,
      })
      .transform(
        ({ address, nextAddress, nextIndex }) => new ProtocolContractLeafPreimage(address, nextAddress, nextIndex),
      );
  }

  getKey(): bigint {
    return this.address.toBigInt();
  }

  getNextKey(): bigint {
    return this.nextAddress.toBigInt();
  }

  getNextIndex(): bigint {
    return this.nextIndex;
  }

  asLeaf(): ProtocolContractLeaf {
    return new ProtocolContractLeaf(this.address);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.toHashInputs());
  }

  toHashInputs(): Buffer[] {
    // Note: the protocol contract leaves only hash the value and next value.
    return [Buffer.from(this.address.toBuffer()), Buffer.from(this.nextAddress.toBuffer())];
  }

  toFields(): Fr[] {
    return [this.address, this.nextAddress, new Fr(this.nextIndex)];
  }

  static random() {
    return new ProtocolContractLeafPreimage(
      Fr.random(),
      Fr.random(),
      BigInt(Math.floor(Math.random() * 1000) % MAX_PROTOCOL_CONTRACTS),
    );
  }

  static empty(): ProtocolContractLeafPreimage {
    return new ProtocolContractLeafPreimage(Fr.ZERO, Fr.ZERO, 0n);
  }

  static fromBuffer(buffer: Buffer | BufferReader): ProtocolContractLeafPreimage {
    const reader = BufferReader.asReader(buffer);
    return new ProtocolContractLeafPreimage(
      reader.readObject(Fr),
      reader.readObject(Fr),
      toBigIntBE(reader.readBytes(32)),
    );
  }
}

/**
 * An address to be inserted or checked in the protocol contract tree.
 */
export class ProtocolContractLeaf implements IndexedTreeLeaf {
  constructor(
    /**
     * Address value.
     */
    public address: Fr,
  ) {}

  getKey(): bigint {
    return this.address.toBigInt();
  }

  toBuffer(): Buffer {
    return this.address.toBuffer();
  }

  isEmpty(): boolean {
    return this.address.isZero();
  }

  updateTo(_another: ProtocolContractLeaf): ProtocolContractLeaf {
    throw new Error('Protocol contract tree is insert only');
  }

  static buildDummy(key: bigint): ProtocolContractLeaf {
    return new ProtocolContractLeaf(new Fr(key));
  }

  static fromBuffer(buf: Buffer): ProtocolContractLeaf {
    return new ProtocolContractLeaf(Fr.fromBuffer(buf));
  }
}
