import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';
import type { PrivateLog } from '@aztec/stdlib/logs';

import { CONTRACT_INSTANCE_PUBLISHED_EVENT_TAG } from '../protocol_contract_data.js';

/** Event emitted from the ContractInstanceRegistry. */
export class ContractInstancePublishedEvent {
  constructor(
    public readonly address: AztecAddress,
    public readonly version: number,
    public readonly salt: Fr,
    public readonly contractClassId: Fr,
    public readonly initializationHash: Fr,
    public readonly publicKeys: PublicKeys,
    public readonly deployer: AztecAddress,
  ) {}

  static isContractInstancePublishedEvent(log: PrivateLog) {
    return log.fields[0].equals(CONTRACT_INSTANCE_PUBLISHED_EVENT_TAG);
  }

  static fromLog(log: PrivateLog) {
    const bufferWithoutTag = log.toBuffer().subarray(32);
    const reader = new BufferReader(bufferWithoutTag);
    const address = reader.readObject(AztecAddress);
    const version = reader.readObject(Fr).toNumber();
    const salt = reader.readObject(Fr);
    const contractClassId = reader.readObject(Fr);
    const initializationHash = reader.readObject(Fr);
    const publicKeys = reader.readObject(PublicKeys);
    const deployer = reader.readObject(AztecAddress);

    return new ContractInstancePublishedEvent(
      address,
      version,
      salt,
      contractClassId,
      initializationHash,
      publicKeys,
      deployer,
    );
  }

  toContractInstance(): ContractInstanceWithAddress {
    if (this.version !== 1) {
      throw new Error(`Unexpected contract instance version ${this.version}`);
    }

    return {
      address: this.address,
      version: this.version,
      currentContractClassId: this.contractClassId,
      originalContractClassId: this.contractClassId,
      initializationHash: this.initializationHash,
      publicKeys: this.publicKeys,
      salt: this.salt,
      deployer: this.deployer,
    };
  }
}
