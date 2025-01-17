import { MerkleTreeId, type MerkleTreeWriteOperations } from '@aztec/circuit-types';
import {
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  DEPLOYER_CONTRACT_ADDRESS,
  PUBLIC_DISPATCH_SELECTOR,
  PublicDataWrite,
  computeInitializationHash,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot, siloNullifier } from '@aztec/circuits.js/hash';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import { type ContractArtifact, FunctionSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { type Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { computeFeePayerBalanceStorageSlot } from '../../server.js';
import { PUBLIC_DISPATCH_FN_NAME, getContractFunctionArtifact } from './index.js';
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
    /* May want to skip contract deployment tree ops to test failed contract address nullifier checks on CALL */
    private skipContractDeployments = false,
  ) {}

  async setFeePayerBalance(feePayer: AztecAddress, balance: Fr) {
    const feeJuiceAddress = ProtocolContractAddress.FeeJuice;
    const balanceSlot = computeFeePayerBalanceStorageSlot(feePayer);
    await this.setPublicStorage(feeJuiceAddress, balanceSlot, balance);
  }

  async setPublicStorage(address: AztecAddress, slot: Fr, value: Fr) {
    const leafSlot = computePublicDataTreeLeafSlot(address, slot);
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
    seed = 0,
  ): Promise<ContractInstanceWithAddress> {
    const bytecode = getContractFunctionArtifact(PUBLIC_DISPATCH_FN_NAME, contractArtifact)!.bytecode;
    const contractClass = makeContractClassPublic(
      seed,
      /*publicDispatchFunction=*/ { bytecode, selector: new FunctionSelector(PUBLIC_DISPATCH_SELECTOR) },
    );

    const constructorAbi = getContractFunctionArtifact('constructor', contractArtifact);
    const initializationHash = computeInitializationHash(constructorAbi, constructorArgs);
    const contractInstance = await makeContractInstanceFromClassId(contractClass.id, seed, {
      deployer,
      initializationHash,
    });

    await this.addContractClass(contractClass, contractArtifact);
    await this.addContractInstance(contractInstance);
    return contractInstance;
  }

  getFirstContractInstance(): ContractInstanceWithAddress {
    return this.contractDataSource.getFirstContractInstance();
  }

  addContractClass(contractClass: ContractClassPublic, contractArtifact: ContractArtifact): Promise<void> {
    this.logger.debug(`Adding contract class with Id ${contractClass.id}`);
    this.contractDataSource.addContractArtifact(contractClass.id, contractArtifact);
    return this.contractDataSource.addContractClass(contractClass);
  }

  async addContractInstance(contractInstance: ContractInstanceWithAddress) {
    if (!this.skipContractDeployments) {
      const contractAddressNullifier = siloNullifier(
        AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
        contractInstance.address.toField(),
      );
      await this.merkleTrees.batchInsert(MerkleTreeId.NULLIFIER_TREE, [contractAddressNullifier.toBuffer()], 0);
    }
    await this.contractDataSource.addContractInstance(contractInstance);
  }
}
