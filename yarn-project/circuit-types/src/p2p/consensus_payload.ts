import { BlockHeader } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { hexToBuffer } from '@aztec/foundation/string';
import { type FieldsOf } from '@aztec/foundation/types';

import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { z } from 'zod';

import { Tx } from '../tx/tx.js';
import { TxHash } from '../tx/tx_hash.js';
import { type Signable, type SignatureDomainSeparator } from './signature_utils.js';

export class BlockProposalPayload implements Signable {
  private size: number | undefined;

  constructor(
    /** The block header the attestation is made over */
    public readonly header: BlockHeader,
    // TODO(https://github.com/AztecProtocol/aztec-packages/pull/7727#discussion_r1713670830): temporary
    public readonly archive: Fr,
    /** The sequence of transactions in the block */
    public readonly txs: Tx[],
  ) {}

  static get schema() {
    return z
      .object({
        header: BlockHeader.schema,
        archive: Fr.schema,
        txs: z.array(Tx.schema),
      })
      .transform(obj => new BlockProposalPayload(obj.header, obj.archive, obj.txs));
  }

  static getFields(fields: FieldsOf<BlockProposalPayload>) {
    return [fields.header, fields.archive, fields.txs] as const;
  }

  async getPayloadToSign(domainSeparator: SignatureDomainSeparator): Promise<Buffer> {
    const abi = parseAbiParameters('uint8, (bytes32, bytes32, (uint256), bytes, bytes32[])');
    const txArray = this.txs.map(tx => tx.toBuffer().toString('hex') as `0x${string}`);
    const encodedData = encodeAbiParameters(abi, [
      domainSeparator,
      [
        this.archive.toString(),
        (await this.header.hash()).toString(),
        [0n] /* @todo See #9963 */,
        this.header.toString(),
        txArray,
      ],
    ] as const);

    return hexToBuffer(encodedData);
  }

  toBuffer(): Buffer {
    const buffer = serializeToBuffer([this.header, this.archive, this.txs.length, this.txs]);
    this.size = buffer.length;
    return buffer;
  }

  static fromBuffer(buf: Buffer | BufferReader): BlockProposalPayload {
    const reader = BufferReader.asReader(buf);
    return new BlockProposalPayload(
      reader.readObject(BlockHeader),
      reader.readObject(Fr),
      reader.readArray(reader.readNumber(), Tx),
    );
  }

  static fromFields(fields: FieldsOf<BlockProposalPayload>): BlockProposalPayload {
    return new BlockProposalPayload(fields.header, fields.archive, fields.txs);
  }

  static empty(): BlockProposalPayload {
    return new BlockProposalPayload(BlockHeader.empty(), Fr.ZERO, []);
  }

  /**
   * Get the size of the block proposal payload in bytes.
   * @returns The size of the block proposal payload.
   */
  getSize(): number {
    // We cache size to avoid recalculating it
    if (this.size) {
      return this.size;
    }
    this.size = this.toBuffer().length;
    return this.size;
  }

  // Convert from the block proposal payload to the consensus payload
  // This version does not include the entire transaction bodies
  async toConsensusPayload(): Promise<ConsensusPayload> {
    const txHashes = await Promise.all(this.txs.map(tx => tx.getTxHash()));
    return new ConsensusPayload(this.header, this.archive, txHashes);
  }
}

export class ConsensusPayload implements Signable {
  private size: number | undefined;

  constructor(
    /** The block header the attestation is made over */
    public readonly header: BlockHeader,
    // TODO(https://github.com/AztecProtocol/aztec-packages/pull/7727#discussion_r1713670830): temporary
    public readonly archive: Fr,
    /** The sequence of transactions in the block */
    public readonly txHashes: TxHash[],
  ) {}

  static get schema() {
    return z
      .object({
        header: BlockHeader.schema,
        archive: Fr.schema,
        txHashes: z.array(TxHash.schema),
      })
      .transform(obj => new ConsensusPayload(obj.header, obj.archive, obj.txHashes));
  }

  static getFields(fields: FieldsOf<ConsensusPayload>) {
    return [fields.header, fields.archive, fields.txHashes] as const;
  }

  async getPayloadToSign(domainSeparator: SignatureDomainSeparator): Promise<Buffer> {
    const abi = parseAbiParameters('uint8, (bytes32, bytes32, (uint256), bytes, bytes32[])');
    const txArray = this.txHashes.map(tx => tx.toString());
    const encodedData = encodeAbiParameters(abi, [
      domainSeparator,
      [
        this.archive.toString(),
        (await this.header.hash()).toString(),
        [0n] /* @todo See #9963 */,
        this.header.toString(),
        txArray,
      ],
    ] as const);

    return hexToBuffer(encodedData);
  }

  toBuffer(): Buffer {
    const buffer = serializeToBuffer([this.header, this.archive, this.txHashes.length, this.txHashes]);
    this.size = buffer.length;
    return buffer;
  }

  static fromBuffer(buf: Buffer | BufferReader): ConsensusPayload {
    const reader = BufferReader.asReader(buf);
    return new ConsensusPayload(
      reader.readObject(BlockHeader),
      reader.readObject(Fr),
      reader.readArray(reader.readNumber(), TxHash),
    );
  }

  static fromFields(fields: FieldsOf<ConsensusPayload>): ConsensusPayload {
    return new ConsensusPayload(fields.header, fields.archive, fields.txHashes);
  }

  static empty(): ConsensusPayload {
    return new ConsensusPayload(BlockHeader.empty(), Fr.ZERO, []);
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
}
