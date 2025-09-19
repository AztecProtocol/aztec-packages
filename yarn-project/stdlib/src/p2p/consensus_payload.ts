import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { z } from 'zod';

import type { L2Block } from '../block/l2_block.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { StateReference } from '../tx/state_reference.js';
import type { Signable, SignatureDomainSeparator } from './signature_utils.js';

export class ConsensusPayload implements Signable {
  private size: number | undefined;

  constructor(
    /** The proposed block header the attestation is made over */
    public readonly header: CheckpointHeader,
    /** The archive root after the block is added */
    public readonly archive: Fr,
    /** The state reference after the block is added */
    public readonly stateReference: StateReference,
  ) {}

  static get schema() {
    return z
      .object({
        header: CheckpointHeader.schema,
        archive: schemas.Fr,
        stateReference: StateReference.schema,
      })
      .transform(obj => new ConsensusPayload(obj.header, obj.archive, obj.stateReference));
  }

  static getFields(fields: FieldsOf<ConsensusPayload>) {
    return [fields.header, fields.archive, fields.stateReference] as const;
  }

  getPayloadToSign(domainSeparator: SignatureDomainSeparator): Buffer {
    const abi = parseAbiParameters(
      'uint8, ' + //domainSeperator
        '(' +
        'bytes32, ' + // archive
        '((bytes32,uint32),((bytes32,uint32),(bytes32,uint32),(bytes32,uint32))), ' + // stateReference
        '(int256), ' + // oracleInput
        'bytes32' + // headerHash
        ')',
    );
    const archiveRoot = this.archive.toString();
    const stateReference = this.stateReference.toAbi();

    const headerHash = this.header.hash().toString();
    const encodedData = encodeAbiParameters(abi, [
      domainSeparator,
      [archiveRoot, stateReference, [0n] /* @todo See #9963 */, headerHash],
    ] as const);

    return hexToBuffer(encodedData);
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.header, this.archive, this.stateReference]);
  }

  public equals(other: ConsensusPayload): boolean {
    return (
      this.header.equals(other.header) &&
      this.archive.equals(other.archive) &&
      this.stateReference.equals(other.stateReference)
    );
  }

  static fromBuffer(buf: Buffer | BufferReader): ConsensusPayload {
    const reader = BufferReader.asReader(buf);
    const payload = new ConsensusPayload(
      reader.readObject(CheckpointHeader),
      reader.readObject(Fr),
      reader.readObject(StateReference),
    );
    return payload;
  }

  static fromFields(fields: FieldsOf<ConsensusPayload>): ConsensusPayload {
    return new ConsensusPayload(fields.header, fields.archive, fields.stateReference);
  }

  static fromBlock(block: L2Block): ConsensusPayload {
    return new ConsensusPayload(block.header.toCheckpointHeader(), block.archive.root, block.header.state);
  }

  static empty(): ConsensusPayload {
    return new ConsensusPayload(CheckpointHeader.empty(), Fr.ZERO, StateReference.empty());
  }

  static random(): ConsensusPayload {
    return new ConsensusPayload(CheckpointHeader.random(), Fr.random(), StateReference.random());
  }

  /**
   * Get the size of the consensus payload in bytes.
   * @returns The size of the consensus payload.
   */
  getSize(): number {
    // We cache size to avoid recalculating it
    if (this.size) {
      return this.size;
    }
    this.size = this.toBuffer().length;
    return this.size;
  }

  toInspect() {
    return {
      header: this.header.toInspect(),
      archive: this.archive.toString(),
      stateReference: this.stateReference.toInspect(),
    };
  }

  toString() {
    return `header: ${this.header.toString()}, archive: ${this.archive.toString()}, stateReference: ${this.stateReference.l1ToL2MessageTree.root.toString()}`;
  }
}
