import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceUpdateWithAddress } from '@aztec/stdlib/contract';
import type { PublicLog } from '@aztec/stdlib/logs';

import { DEPLOYER_CONTRACT_INSTANCE_UPDATED_TAG, ProtocolContractAddress } from '../protocol_contract_data.js';

/** Event emitted from the ContractInstanceDeployer. */
export class ContractInstanceUpdatedEvent {
  constructor(
    public readonly address: AztecAddress,
    public readonly prevContractClassId: Fr,
    public readonly newContractClassId: Fr,
    public readonly blockOfChange: number,
  ) {}

  static isContractInstanceUpdatedEvent(log: PublicLog) {
    return (
      log.contractAddress.equals(ProtocolContractAddress.ContractInstanceDeployer) &&
      log.fields[0].equals(DEPLOYER_CONTRACT_INSTANCE_UPDATED_TAG)
    );
  }

  static fromLog(log: PublicLog) {
    const bufferWithoutAddressAndTag = log.toBuffer().subarray(64);
    const reader = new BufferReader(bufferWithoutAddressAndTag);
    const address = reader.readObject(AztecAddress);
    const prevContractClassId = reader.readObject(Fr);
    const newContractClassId = reader.readObject(Fr);
    const blockOfChange = reader.readObject(Fr).toNumber();

    return new ContractInstanceUpdatedEvent(address, prevContractClassId, newContractClassId, blockOfChange);
  }

  toContractInstanceUpdate(): ContractInstanceUpdateWithAddress {
    return {
      address: this.address,
      prevContractClassId: this.prevContractClassId,
      newContractClassId: this.newContractClassId,
      blockOfChange: this.blockOfChange,
    };
  }
}
