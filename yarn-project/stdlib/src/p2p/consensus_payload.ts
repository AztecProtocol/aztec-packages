import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { z } from 'zod';

import type { L2Block } from '../block/l2_block.js';
import { ProposedBlockHeader } from '../tx/index.js';
import { TxHash } from '../tx/tx_hash.js';
import type { Signable, SignatureDomainSeparator } from './signature_utils.js';

export class ConsensusPayload implements Signable {
  private size: number | undefined;

  constructor(
    /** The proposed block header the attestation is made over */
    public readonly header: ProposedBlockHeader,
    // TODO(https://github.com/AztecProtocol/aztec-packages/pull/7727#discussion_r1713670830): temporary
    public readonly archive: Fr,
    /** The sequence of transactions in the block */
    public readonly txHashes: TxHash[],
  ) {}

  static get schema() {
    return z
      .object({
        header: ProposedBlockHeader.schema,
        archive: schemas.Fr,
        txHashes: z.array(TxHash.schema),
      })
      .transform(obj => new ConsensusPayload(obj.header, obj.archive, obj.txHashes));
  }

  static getFields(fields: FieldsOf<ConsensusPayload>) {
    return [fields.header, fields.archive, fields.txHashes] as const;
  }

  getPayloadToSign(domainSeparator: SignatureDomainSeparator): Buffer {
    const abi = parseAbiParameters('uint8, (bytes32, (uint256), bytes32, bytes32[])');
    const headerHash = this.header.hash().toString();
    const txArray = this.txHashes.map(tx => tx.toString());
    const encodedData = encodeAbiParameters(abi, [
      domainSeparator,
      [this.archive.toString(), [0n] /* @todo See #9963 */, headerHash, txArray],
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
      reader.readObject(ProposedBlockHeader),
      reader.readObject(Fr),
      reader.readArray(reader.readNumber(), TxHash),
    );
  }

  static fromFields(fields: FieldsOf<ConsensusPayload>): ConsensusPayload {
    return new ConsensusPayload(fields.header, fields.archive, fields.txHashes);
  }

  static fromBlock(block: L2Block): ConsensusPayload {
    return new ConsensusPayload(
      block.header.toPropose(),
      block.archive.root,
      block.body.txEffects.map(tx => tx.txHash),
    );
  }

  static empty(): ConsensusPayload {
    return new ConsensusPayload(ProposedBlockHeader.empty(), Fr.ZERO, []);
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
