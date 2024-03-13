import { AztecAddress } from '@aztec/foundation/aztec-address';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';
import { ContractInstanceWithAddress } from '@aztec/types/contracts';

import { DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE } from '../constants.gen.js';

/** Event emitted from the ContractInstanceDeployer. */
export class ContractInstanceDeployedEvent {
  constructor(
    public readonly address: AztecAddress,
    public readonly version: number,
    public readonly salt: Fr,
    public readonly contractClassId: Fr,
    public readonly initializationHash: Fr,
    public readonly portalContractAddress: EthAddress,
    public readonly publicKeysHash: Fr,
    public readonly universalDeploy: boolean,
  ) {}

  static isContractInstanceDeployedEvent(log: Buffer) {
    return toBigIntBE(log.subarray(0, 32)) == DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE;
  }

  // TODO(@spalladino) We should be loading the singleton address from protocol-contracts,
  // but the protocol-contracts package depends on this one, and we cannot have circular dependencies,
  // hence we require it as an argument for now.
  static fromLogs(logs: { contractAddress: AztecAddress; data: Buffer }[], instanceDeployerAddress: AztecAddress) {
    return logs
      .filter(log => ContractInstanceDeployedEvent.isContractInstanceDeployedEvent(log.data))
      .filter(log => log.contractAddress.equals(instanceDeployerAddress))
      .map(log => ContractInstanceDeployedEvent.fromLogData(log.data));
  }

  static fromLogData(log: Buffer) {
    if (!this.isContractInstanceDeployedEvent(log)) {
      const magicValue = DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE.toString(16);
      throw new Error(`Log data for ContractInstanceDeployedEvent is not prefixed with magic value 0x${magicValue}`);
    }
    const reader = new BufferReader(log.subarray(32));
    const address = reader.readObject(AztecAddress);
    const version = reader.readObject(Fr).toNumber();
    const salt = reader.readObject(Fr);
    const contractClassId = reader.readObject(Fr);
    const initializationHash = reader.readObject(Fr);
    const portalContractAddress = EthAddress.fromField(reader.readObject(Fr));
    const publicKeysHash = reader.readObject(Fr);
    const universalDeploy = reader.readObject(Fr).toBool();

    return new ContractInstanceDeployedEvent(
      address,
      version,
      salt,
      contractClassId,
      initializationHash,
      portalContractAddress,
      publicKeysHash,
      universalDeploy,
    );
  }

  toContractInstance(): ContractInstanceWithAddress {
    if (this.version !== 1) {
      throw new Error(`Unexpected contract instance version ${this.version}`);
    }

    return {
      address: this.address,
      version: this.version,
      contractClassId: this.contractClassId,
      initializationHash: this.initializationHash,
      portalContractAddress: this.portalContractAddress,
      publicKeysHash: this.publicKeysHash,
      salt: this.salt,
    };
  }
}
