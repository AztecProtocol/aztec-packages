import { CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { FieldReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceUpdateWithAddress } from '@aztec/stdlib/contract';
import type { PublicLog } from '@aztec/stdlib/logs';
import type { UInt64 } from '@aztec/stdlib/types';

import { ProtocolContractAddress } from '../protocol_contract_data.js';

/** Event emitted from the ContractInstanceRegistry. */
export class ContractInstanceUpdatedEvent {
  constructor(
    public readonly address: AztecAddress,
    public readonly prevContractClassId: Fr,
    public readonly newContractClassId: Fr,
    public readonly timestampOfChange: UInt64,
  ) {}

  static isContractInstanceUpdatedEvent(log: PublicLog) {
    return (
      log.contractAddress.equals(ProtocolContractAddress.ContractInstanceRegistry) &&
      log.fields[0].toBigInt() === CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE
    );
  }

  static fromLog(log: PublicLog) {
    const reader = new FieldReader(log.fields.slice(1) /* remove tag */);
    const address = reader.readObject(AztecAddress);
    const prevContractClassId = reader.readField();
    const newContractClassId = reader.readField();
    const timestampOfChange = reader.readField().toBigInt();
    return new ContractInstanceUpdatedEvent(address, prevContractClassId, newContractClassId, timestampOfChange);
  }

  toContractInstanceUpdate(): ContractInstanceUpdateWithAddress {
    return {
      address: this.address,
      prevContractClassId: this.prevContractClassId,
      newContractClassId: this.newContractClassId,
      timestampOfChange: this.timestampOfChange,
    };
  }
}
