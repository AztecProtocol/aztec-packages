import { MerkleTreeId } from '@aztec/circuit-types';
import { type MerkleTreeWriteOperations } from '@aztec/circuit-types/interfaces/server';
import { type ContractClassPublic, type ContractInstanceWithAddress, PublicDataWrite } from '@aztec/circuits.js';
import { type ContractArtifact } from '@aztec/circuits.js/abi';
import { computePublicDataTreeLeafSlot, siloNullifier } from '@aztec/circuits.js/hash';
import { DEPLOYER_CONTRACT_ADDRESS } from '@aztec/constants';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';

import { type SimpleContractDataSource } from './simple_contract_data_source.js';

/**
 * An abstract test class that enables tests of real apps in the AVM without requiring e2e tests.
 * It enables this by letting us (1) perform pseudo-contract-deployments (and registrations)
 * that trigger merkle tree operations and (2) maintain a contract data source to store
 * and retrieve contract classes and instances.
 *
 * This class is meant to be extended when writing tests for a specific simulation interface.
 * For example, has been extended for testing of the core AvmSimulator, and again for the PublicTxSimulator,
 * both of which benefit from such pseudo-deployments by populating merkle trees and a contract data source
 * with contract information.
 */
export abstract class BaseAvmSimulationTester {
  public logger = createLogger('avm-simulation-tester');

  constructor(
    public contractDataSource: SimpleContractDataSource,
    public merkleTrees: MerkleTreeWriteOperations,
    private initialFeePayerBalance = new Fr(10 ** 10),
  ) {}

  async setFeePayerBalance(feePayer: AztecAddress, balance = this.initialFeePayerBalance) {
    const feeJuiceAddress = ProtocolContractAddress.FeeJuice;
    const balanceSlot = await computeFeePayerBalanceStorageSlot(feePayer);
    await this.setPublicStorage(feeJuiceAddress, balanceSlot, balance);
  }

  async setPublicStorage(address: AztecAddress, slot: Fr, value: Fr) {
    const leafSlot = await computePublicDataTreeLeafSlot(address, slot);
    // get existing preimage
    const publicDataWrite = new PublicDataWrite(leafSlot, value);
    await this.merkleTrees.batchInsert(MerkleTreeId.PUBLIC_DATA_TREE, [publicDataWrite.toBuffer()], 0);
  }

  /**
   * Derive the contract class and instance with some seed.
   * Add both to the contract data source along with the contract artifact.
   */
  async registerAndDeployContract(
    constructorArgs: any[],
    deployer: AztecAddress,
    contractArtifact: ContractArtifact,
    skipNullifierInsertion = false,
    seed = 0,
    originalContractClassId?: Fr, // if previously upgraded
  ): Promise<ContractInstanceWithAddress> {
    const contractInstance = await this.contractDataSource.registerAndDeployContract(
      constructorArgs,
      deployer,
      contractArtifact,
      seed,
      originalContractClassId,
    );
    if (!skipNullifierInsertion) {
      await this.insertContractAddressNullifier(contractInstance.address);
    }
    return contractInstance;
  }

  async registerFeeJuiceContract(): Promise<ContractInstanceWithAddress> {
    return await this.contractDataSource.registerFeeJuiceContract();
  }

  getFirstContractInstance(): ContractInstanceWithAddress {
    return this.contractDataSource.getFirstContractInstance();
  }

  addContractClass(contractClass: ContractClassPublic, contractArtifact: ContractArtifact): Promise<void> {
    this.logger.debug(`Adding contract class with Id ${contractClass.id}`);
    this.contractDataSource.addContractArtifact(contractClass.id, contractArtifact);
    return this.contractDataSource.addContractClass(contractClass);
  }

  async addContractInstance(contractInstance: ContractInstanceWithAddress, skipNullifierInsertion = false) {
    if (!skipNullifierInsertion) {
      await this.insertContractAddressNullifier(contractInstance.address);
    }
    await this.contractDataSource.addContractInstance(contractInstance);
  }

  private async insertContractAddressNullifier(contractAddress: AztecAddress) {
    const contractAddressNullifier = await siloNullifier(
      AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
      contractAddress.toField(),
    );
    await this.merkleTrees.batchInsert(MerkleTreeId.NULLIFIER_TREE, [contractAddressNullifier.toBuffer()], 0);
  }
}
