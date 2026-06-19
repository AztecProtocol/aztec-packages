import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { EntityKey, type OriginBlock } from './entity_store_keys.js';

/**
 * The record for a single entity.
 */
export class StoredEntity {
  constructor(
    public readonly key: EntityKey,
    public readonly body: Fr[],
    public readonly originBlock: OriginBlock | undefined,
  ) {}

  /** Whether the whole entity is deleted on block pruning (true) or survives reorgs (false). */
  get isRetractable(): boolean {
    return this.originBlock !== undefined;
  }

  toBuffer(): Buffer {
    return serializeToBuffer(
      this.key.contractAddress,
      this.key.scope,
      this.key.entityTypeId,
      this.key.entityId,
      this.body.length,
      ...this.body,
      this.originBlock !== undefined,
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
    const bodyLen = reader.readNumber();
    const body = reader.readArray(bodyLen, Fr);
    const hasOriginBlock = reader.readBoolean();
    const blockNumber = reader.readNumber();
    const blockHash = reader.readObject(Fr);
    const originBlock = hasOriginBlock ? { blockNumber, blockHash } : undefined;
    return new StoredEntity(new EntityKey(contractAddress, scope, entityTypeId, entityId), [...body], originBlock);
  }
}
