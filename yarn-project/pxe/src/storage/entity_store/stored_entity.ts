import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { OriginBlock } from './entity_keys.js';

/**
 * The record for a single entity, with its own payload and optional origin block. `originBlock === undefined` marks
 * the entity non-retractable (it survives reorgs; only its own retractable facts are pruned); an origin block marks
 * the whole entity retractable — on a prune above its block, the entity payload and every fact it owns are deleted
 * wholesale.
 */
export class StoredEntity {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly scope: AztecAddress,
    public readonly entityTypeId: Fr,
    public readonly entityId: Fr,
    public readonly payload: Fr[],
    public readonly originBlock: OriginBlock | undefined,
  ) {}

  /** Whether the whole entity is deleted on block pruning (true) or survives reorgs (false). */
  get isRetractable(): boolean {
    return this.originBlock !== undefined;
  }

  toBuffer(): Buffer {
    const originBlockTag = this.originBlock ? 1 : 0;
    return serializeToBuffer(
      this.contractAddress,
      this.scope,
      this.entityTypeId,
      this.entityId,
      this.payload.length,
      ...this.payload,
      originBlockTag,
      this.originBlock ? this.originBlock.blockNumber : 0,
      this.originBlock ? this.originBlock.blockHash : Fr.ZERO,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): StoredEntity {
    const reader = BufferReader.asReader(buffer);
    const contractAddress = reader.readObject(AztecAddress);
    const scope = reader.readObject(AztecAddress);
    const entityTypeId = reader.readObject(Fr);
    const entityId = reader.readObject(Fr);
    const payloadLen = reader.readNumber();
    const payload = reader.readArray(payloadLen, Fr);
    const originBlockTag = reader.readNumber();
    const blockNumber = reader.readNumber();
    const blockHash = reader.readObject(Fr);
    const originBlock = originBlockTag === 1 ? { blockNumber, blockHash } : undefined;
    return new StoredEntity(contractAddress, scope, entityTypeId, entityId, [...payload], originBlock);
  }
}
