import { type ContractInstanceUpdateWithAddress, type PrivateLog } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';

import { DEPLOYER_CONTRACT_INSTANCE_UPDATED_TAG } from '../protocol_contract_data.js';

/** Event emitted from the ContractInstanceDeployer. */
export class ContractInstanceUpdatedEvent {
  constructor(
    public readonly address: AztecAddress,
    public readonly prevContractClassId: Fr,
    public readonly newContractClassId: Fr,
    public readonly blockOfChange: number,
  ) {}

  static isContractInstanceUpdatedEvent(log: PrivateLog) {
    return log.fields[0].equals(DEPLOYER_CONTRACT_INSTANCE_UPDATED_TAG);
  }

  static fromLog(log: PrivateLog) {
    const bufferWithoutTag = log.toBuffer().subarray(32);
    const reader = new BufferReader(bufferWithoutTag);
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
