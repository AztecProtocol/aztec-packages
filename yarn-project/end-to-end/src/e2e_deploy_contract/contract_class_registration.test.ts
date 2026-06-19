import type { ContractArtifact } from '@aztec/aztec.js/abi';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  type ContractClassWithId,
  type ContractInstanceWithAddress,
  getContractClassFromArtifact,
  getContractInstanceFromInstantiationParams,
} from '@aztec/aztec.js/contracts';
import { publishContractClass, publishInstance } from '@aztec/aztec.js/deployment';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { TxExecutionResult, type TxReceipt } from '@aztec/aztec.js/tx';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import { writeTestData } from '@aztec/foundation/testing/files';
import { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { ContractClassIdPreimage } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS, DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { DeployTest, type StatefulContractCtorArgs } from './deploy_test.js';

describe('e2e_deploy_contract contract class registration', () => {
  // Pipelined cadence (~24s/dependent-tx) inflates the chained deploy/publish setup beyond the default 5 min
  // hook window. Many of the publishInstance helpers serially register multiple contracts/instances per case.
  jest.setTimeout(900_000);

  const t = new DeployTest('contract class');

  let logger: Logger;
  let wallet: Wallet;
  let defaultAccountAddress: AztecAddress;
  let aztecNode: AztecNode;

  let artifact: ContractArtifact;
  let contractClass: ContractClassWithId & ContractClassIdPreimage;
  let publicationTxReceipt: TxReceipt;

  beforeAll(async () => {
    ({ logger, wallet, aztecNode, defaultAccountAddress } = await t.setup({ ...AUTOMINE_E2E_OPTS }));
    artifact = StatefulTestContract.artifact;
    publicationTxReceipt = await publishContractClass(wallet, artifact).then(c =>
      c.send({ from: defaultAccountAddress }).then(({ receipt }) => receipt),
    );
    contractClass = await getContractClassFromArtifact(artifact);
    expect(await aztecNode.getContractClass(contractClass.id)).toBeDefined();
  });

  afterAll(() => t.teardown());

  describe('publishing a contract class', () => {
    it('emits public bytecode', async () => {
      const { receipt: publicationTxReceipt } = await publishContractClass(wallet, TestContract.artifact).then(c =>
        c.send({ from: defaultAccountAddress }),
      );
      const txEffect = await aztecNode.getTxEffect(publicationTxReceipt.txHash);
      expect(txEffect?.data.contractClassLogs.length).toEqual(1);
    });

    it('registers the contract class on the node', async () => {
      const txEffect = await aztecNode.getTxEffect(publicationTxReceipt.txHash);
      expect(txEffect?.data.contractClassLogs.length).toEqual(1);
      const logData = txEffect!.data.contractClassLogs[0].toBuffer();

      // To actually trigger this write:
      // From `yarn-project/end-to-end/`
      // AZTEC_GENERATE_TEST_DATA=1 yarn test contract_class_registration.test.ts
      writeTestData('yarn-project/protocol-contracts/fixtures/ContractClassPublishedEventData.hex', logData);

      const registeredClass = await aztecNode.getContractClass(contractClass.id);
      expect(registeredClass).toBeDefined();
      expect(registeredClass!.artifactHash.toString()).toEqual(contractClass.artifactHash.toString());
      expect(registeredClass!.privateFunctionsRoot.toString()).toEqual(contractClass.privateFunctionsRoot.toString());
      expect(registeredClass!.packedBytecode.toString('hex')).toEqual(contractClass.packedBytecode.toString('hex'));
    });
  });

  const testDeployingAnInstance = (
    how: string,
    deployFn: (toDeploy: ContractInstanceWithAddress) => Promise<BlockNumber>,
  ) =>
    describe(`deploying a contract instance ${how}`, () => {
      let instance: ContractInstanceWithAddress;
      let initArgs: StatefulContractCtorArgs;
      let contract: StatefulTestContract;

      const publishInstance = async (opts: { constructorName?: string; deployer?: AztecAddress } = {}) => {
        const initArgs = [defaultAccountAddress, 42] as StatefulContractCtorArgs;
        const salt = Fr.random();
        const publicKeys = await PublicKeys.random();
        const instance = await getContractInstanceFromInstantiationParams(artifact, {
          constructorArgs: initArgs,
          salt,
          publicKeys,
          constructorArtifact: opts.constructorName,
          deployer: opts.deployer,
        });
        const { address, currentContractClassId: contractClassId } = instance;
        logger.info(`Deploying contract instance at ${address.toString()} class id ${contractClassId.toString()}`);
        const publishBlockNumber = await deployFn(instance);

        // TODO(@spalladino) We should **not** need the whole instance, including initArgs and salt,
        // in order to interact with a public function for the contract. We may even not need
        // all of it for running a private function. Consider removing `instance` as a required
        // field in the aztec.js `Contract` class, maybe we can replace it with just the partialAddress.
        // Not just that, but this instance has been broadcasted, so the pxe should be able to get
        // its information from the node directly, excluding private functions, but it's ok because
        // we are not going to run those - but this may require registering "partial" contracts in the pxe.
        // Anyway, when we implement that, we should be able to replace this `registerContract` with
        // a simpler `Contract.at(instance.address, wallet)`.
        const registered = await t.registerContract(wallet, StatefulTestContract, {
          constructorName: opts.constructorName,
          salt: instance.salt,
          publicKeys,
          initArgs,
          deployer: opts.deployer,
        });
        expect(registered.address).toEqual(instance.address);
        const contract = StatefulTestContract.at(instance.address, wallet);
        return { contract, initArgs, instance, publicKeys, publishBlockNumber };
      };

      describe('using a private constructor', () => {
        let publishBlockNumber: BlockNumber;
        beforeAll(async () => {
          const result = await publishInstance();
          ({ instance, initArgs, contract } = result);
          publishBlockNumber = result.publishBlockNumber;
        });

        it('stores contract instance in the aztec node', async () => {
          // Contract instance deployed event is emitted via private logs. Read the block carrying
          // the publish tx directly — under pipelining the "latest" block at this point may be an
          // empty pipelined block, and the publish tx's receipt blockNumber is the authoritative
          // anchor.
          const logs = (await aztecNode.getBlock(publishBlockNumber, {
            includeTransactions: true,
          }))!.body.txEffects.flatMap(t => t.privateLogs);

          expect(logs.length).toBe(1);

          // To actually trigger this write:
          // From `yarn-project/end-to-end/`
          // AZTEC_GENERATE_TEST_DATA=1 yarn test contract_class_registration.test.ts
          writeTestData(
            'yarn-project/protocol-contracts/fixtures/ContractInstancePublishedEventData.hex',
            logs[0].toBuffer(),
          );

          const deployed = await aztecNode.getContract(instance.address);
          expect(deployed).toBeDefined();
          expect(deployed!.address).toEqual(instance.address);
          expect(deployed!.currentContractClassId).toEqual(contractClass.id);
          expect(deployed!.initializationHash).toEqual(instance.initializationHash);
          expect(deployed!.immutablesHash).toEqual(instance.immutablesHash);
          expect(deployed!.publicKeys).toEqual(instance.publicKeys);
          expect(deployed!.salt).toEqual(instance.salt);
          expect(deployed!.deployer).toEqual(instance.deployer);
        });

        it('calls a public function with no init check on the deployed instance', async () => {
          const whom = await AztecAddress.random();
          await contract.methods.increment_public_value_no_init_check(whom, 10).send({ from: defaultAccountAddress });
          const { result: stored } = await contract.methods
            .get_public_value(whom)
            .simulate({ from: defaultAccountAddress });
          expect(stored).toEqual(10n);
        });

        it('refuses to call a public function with init check if the instance is not initialized', async () => {
          const whom = await AztecAddress.random();
          const { receipt } = await contract.methods
            .increment_public_value(whom, 10)
            .send({ from: defaultAccountAddress, wait: { dontThrowOnRevert: true } });
          expect(receipt.executionResult).toEqual(TxExecutionResult.REVERTED);

          // Meanwhile we check we didn't increment the value
          expect(
            (await contract.methods.get_public_value(whom).simulate({ from: defaultAccountAddress })).result,
          ).toEqual(0n);
        });

        it('refuses to initialize the instance with wrong args via a private function', async () => {
          await expect(
            contract.methods.constructor(await AztecAddress.random(), 43).simulate({ from: defaultAccountAddress }),
          ).rejects.toThrow(/initialization hash does not match/i);
        });

        it('initializes the contract and calls a public function', async () => {
          await contract.methods.constructor(...initArgs).send({ from: defaultAccountAddress });
          const whom = await AztecAddress.random();
          await contract.methods.increment_public_value(whom, 10).send({ from: defaultAccountAddress });
          const { result: stored } = await contract.methods
            .get_public_value(whom)
            .simulate({ from: defaultAccountAddress });
          expect(stored).toEqual(10n);
        });

        it('refuses to reinitialize the contract', async () => {
          await expect(
            contract.methods.constructor(...initArgs).send({ from: defaultAccountAddress }),
            // TODO(https://github.com/AztecProtocol/aztec-packages/issues/5818): Make these a fixed error after transition.
          ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
        });
      });

      describe('using a public constructor', () => {
        beforeAll(async () => {
          ({ instance, initArgs, contract } = await publishInstance({
            constructorName: 'public_constructor',
          }));
        });

        it('refuses to initialize the instance with wrong args via a public function', async () => {
          const whom = await AztecAddress.random();
          const { receipt } = await contract.methods
            .public_constructor(whom, 43)
            .send({ from: defaultAccountAddress, wait: { dontThrowOnRevert: true } });
          expect(receipt.executionResult).toEqual(TxExecutionResult.REVERTED);
          expect(
            (await contract.methods.get_public_value(whom).simulate({ from: defaultAccountAddress })).result,
          ).toEqual(0n);
        });

        it('initializes the contract and calls a public function', async () => {
          await contract.methods.public_constructor(...initArgs).send({ from: defaultAccountAddress });
          const whom = await AztecAddress.random();
          await contract.methods.increment_public_value(whom, 10).send({ from: defaultAccountAddress });
          const { result: stored } = await contract.methods
            .get_public_value(whom)
            .simulate({ from: defaultAccountAddress });
          expect(stored).toEqual(10n);
        });

        it('refuses to reinitialize the contract', async () => {
          await expect(
            contract.methods.public_constructor(...initArgs).send({ from: defaultAccountAddress }),
          ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
        });
      });
    });

  testDeployingAnInstance('from a wallet', async instance => {
    // Calls the deployer contract directly from a wallet
    const deployMethod = publishInstance(wallet, instance);
    const { receipt } = await deployMethod.send({ from: defaultAccountAddress });
    return receipt.blockNumber!;
  });

  testDeployingAnInstance('from a contract', async instance => {
    // Register the instance to be deployed in the pxe
    await wallet.registerContract(instance, artifact);
    // Set up the contract that calls the deployer (which happens to be the TestContract) and call it
    const { contract: deployer } = await TestContract.deploy(wallet).send({ from: defaultAccountAddress });
    const { receipt } = await deployer.methods
      .publish_contract_instance(instance.address)
      .send({ from: defaultAccountAddress });
    return receipt.blockNumber!;
  });

  describe('error scenarios in deployment', () => {
    it('app logic call to an undeployed contract reverts, but can be included', async () => {
      const whom = defaultAccountAddress;
      const instance = await t.registerContract(wallet, StatefulTestContract, { initArgs: [whom, 42] });
      // Confirm that the tx reverts with the expected message
      await expect(
        instance.methods.increment_public_value_no_init_check(whom, 10).simulate({ from: defaultAccountAddress }),
      ).rejects.toThrow(/not deployed/);
      // This time, don't throw on revert and confirm that the tx is included
      // despite reverting in app logic because of the call to a non-existent contract
      const { receipt: tx } = await instance.methods
        .increment_public_value_no_init_check(whom, 10)
        .send({ from: defaultAccountAddress, wait: { dontThrowOnRevert: true } });
      expect(tx.executionResult).toEqual(TxExecutionResult.REVERTED);
    });
  });
});
