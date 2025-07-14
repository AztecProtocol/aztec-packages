import { CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceStorageSlot, getCanonicalFeeJuice } from '@aztec/protocol-contracts/fee-juice';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { computePublicDataTreeLeafSlot, siloNullifier } from '@aztec/stdlib/hash';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import type { SimpleContractDataSource } from '../../fixtures/simple_contract_data_source.js';
import { createContractClassAndInstance } from './utils.js';

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
    await this.merkleTrees.sequentialInsert(MerkleTreeId.PUBLIC_DATA_TREE, [publicDataWrite.toBuffer()]);
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
    const { contractClass, contractInstance } = await createContractClassAndInstance(
      constructorArgs,
      deployer,
      contractArtifact,
      seed,
      originalContractClassId,
    );

    await this.contractDataSource.addNewContract(contractArtifact, contractClass, contractInstance);

    if (!skipNullifierInsertion) {
      await this.insertContractAddressNullifier(contractInstance.address);
    }
    return contractInstance;
  }

  async registerFeeJuiceContract(): Promise<ContractInstanceWithAddress> {
    const feeJuice = await getCanonicalFeeJuice();
    const feeJuiceContractClassPublic = {
      ...feeJuice.contractClass,
      privateFunctions: [],
      utilityFunctions: [],
    };
    await this.contractDataSource.addNewContract(feeJuice.artifact, feeJuiceContractClassPublic, feeJuice.instance);
    return feeJuice.instance;
  }

  async addContractInstance(contractInstance: ContractInstanceWithAddress, skipNullifierInsertion = false) {
    if (!skipNullifierInsertion) {
      await this.insertContractAddressNullifier(contractInstance.address);
    }
    await this.contractDataSource.addContractInstance(contractInstance);
  }

  private async insertContractAddressNullifier(contractAddress: AztecAddress) {
    const contractAddressNullifier = await siloNullifier(
      AztecAddress.fromNumber(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS),
      contractAddress.toField(),
    );
    await this.merkleTrees.sequentialInsert(MerkleTreeId.NULLIFIER_TREE, [contractAddressNullifier.toBuffer()]);
  }

  async insertNullifier(contractThatEmitted: AztecAddress, nullifier: Fr) {
    const siloedNullifier = await siloNullifier(contractThatEmitted, nullifier);
    await this.merkleTrees.sequentialInsert(MerkleTreeId.NULLIFIER_TREE, [siloedNullifier.toBuffer()]);
  }
}
