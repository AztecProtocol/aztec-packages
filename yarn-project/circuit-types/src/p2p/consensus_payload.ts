import { Header } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { encodeAbiParameters, parseAbiParameters } from 'viem';

import { TxHash } from '../tx/tx_hash.js';
import { type Signable } from './signature_utils.js';

export class ConsensusPayload implements Signable {
  private size: number | undefined;

  constructor(
    /** The block header the attestation is made over */
    public readonly header: Header,
    // TODO(https://github.com/AztecProtocol/aztec-packages/pull/7727#discussion_r1713670830): temporary
    public readonly archive: Fr,
    /** The sequence of transactions in the block */
    public readonly txHashes: TxHash[],
  ) {}

  static getFields(fields: FieldsOf<ConsensusPayload>) {
    return [fields.header, fields.archive, fields.txHashes] as const;
  }

  getPayloadToSign(): Buffer {
    const abi = parseAbiParameters('bytes32, bytes32[]');
    const txArray = this.txHashes.map(tx => tx.to0xString());
    const encodedData = encodeAbiParameters(abi, [this.archive.toString(), txArray] as const);

    return Buffer.from(encodedData.slice(2), 'hex');
  }

  toBuffer(): Buffer {
    const buffer = serializeToBuffer([this.header, this.archive, this.txHashes.length, this.txHashes]);
    this.size = buffer.length;
    return buffer;
  }

  static fromBuffer(buf: Buffer | BufferReader): ConsensusPayload {
    const reader = BufferReader.asReader(buf);
    return new ConsensusPayload(
      reader.readObject(Header),
      reader.readObject(Fr),
      reader.readArray(reader.readNumber(), TxHash),
    );
  }

  static fromFields(fields: FieldsOf<ConsensusPayload>): ConsensusPayload {
    return new ConsensusPayload(fields.header, fields.archive, fields.txHashes);
  }

  static empty(): ConsensusPayload {
    return new ConsensusPayload(Header.empty(), Fr.ZERO, []);
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
