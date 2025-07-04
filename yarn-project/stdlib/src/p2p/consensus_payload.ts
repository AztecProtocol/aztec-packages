import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { z } from 'zod';

import type { L2Block } from '../block/l2_block.js';
import { ProposedBlockHeader, StateReference } from '../tx/index.js';
import type { Signable, SignatureDomainSeparator } from './signature_utils.js';

export class ConsensusPayload implements Signable {
  private size: number | undefined;

  constructor(
    /** The proposed block header the attestation is made over */
    public readonly header: ProposedBlockHeader,
    /** The archive root after the block is added */
    public readonly archive: Fr,
    /** The state reference after the block is added */
    public readonly stateReference: StateReference,
  ) {}

  static get schema() {
    return z
      .object({
        header: ProposedBlockHeader.schema,
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
    const buffer = serializeToBuffer([this.header, this.archive, this.stateReference]);
    this.size = buffer.length;
    return buffer;
  }

  static fromBuffer(buf: Buffer | BufferReader): ConsensusPayload {
    const reader = BufferReader.asReader(buf);
    return new ConsensusPayload(
      reader.readObject(ProposedBlockHeader),
      reader.readObject(Fr),
      reader.readObject(StateReference),
    );
  }

  static fromFields(fields: FieldsOf<ConsensusPayload>): ConsensusPayload {
    return new ConsensusPayload(fields.header, fields.archive, fields.stateReference);
  }

  static fromBlock(block: L2Block): ConsensusPayload {
    return new ConsensusPayload(block.header.toPropose(), block.archive.root, block.header.state);
  }

  static empty(): ConsensusPayload {
    return new ConsensusPayload(ProposedBlockHeader.empty(), Fr.ZERO, StateReference.empty());
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

  toString() {
    return `header: ${this.header.toString()}, archive: ${this.archive.toString()}, stateReference: ${this.stateReference.l1ToL2MessageTree.root.toString()}`;
  }
}
