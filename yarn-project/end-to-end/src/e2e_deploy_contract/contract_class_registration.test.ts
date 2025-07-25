import {
  AztecAddress,
  type AztecNode,
  type ContractArtifact,
  type ContractClassWithId,
  type ContractInstanceWithAddress,
  type FieldsOf,
  Fr,
  type Logger,
  type PXE,
  type TxReceipt,
  TxStatus,
  type Wallet,
  getContractClassFromArtifact,
  getContractInstanceFromInstantiationParams,
} from '@aztec/aztec.js';
import {
  broadcastPrivateFunction,
  broadcastUtilityFunction,
  publishContractClass,
  publishInstance,
} from '@aztec/aztec.js/deployment';
import { writeTestData } from '@aztec/foundation/testing/files';
import { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import type { ContractClassIdPreimage } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';

import { DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { DeployTest, type StatefulContractCtorArgs } from './deploy_test.js';

describe('e2e_deploy_contract contract class registration', () => {
  const t = new DeployTest('contract class');

  let pxe: PXE;
  let logger: Logger;
  let wallet: Wallet;
  let aztecNode: AztecNode;

  beforeAll(async () => {
    ({ pxe, logger, wallet, aztecNode } = await t.setup());
  });

  afterAll(() => t.teardown());

  let artifact: ContractArtifact;
  let contractClass: ContractClassWithId & ContractClassIdPreimage;
  let publicationTxReceipt: FieldsOf<TxReceipt>;

  beforeAll(async () => {
    artifact = StatefulTestContract.artifact;
    publicationTxReceipt = await publishContractClass(wallet, artifact).then(c => c.send().wait());
    contractClass = await getContractClassFromArtifact(artifact);
    expect(await aztecNode.getContractClass(contractClass.id)).toBeDefined();
  });

  describe('publishing a contract class', () => {
    it('emits public bytecode', async () => {
      const publicationTxReceipt = await publishContractClass(wallet, TestContract.artifact).then(c => c.send().wait());
      const logs = await aztecNode.getContractClassLogs({ txHash: publicationTxReceipt.txHash });
      expect(logs.logs.length).toEqual(1);
    });

    it('registers the contract class on the node', async () => {
      const logs = await aztecNode.getContractClassLogs({ txHash: publicationTxReceipt.txHash });
      expect(logs.logs.length).toEqual(1);
      const logData = logs.logs[0].log.toBuffer();

      // To actually trigger this write:
      // From `yarn-project/end-to-end/`
      // AZTEC_GENERATE_TEST_DATA=1 yarn test contract_class_registration.test.ts
      writeTestData('yarn-project/protocol-contracts/fixtures/ContractClassPublishedEventData.hex', logData);

      const registeredClass = await aztecNode.getContractClass(contractClass.id);
      expect(registeredClass).toBeDefined();
      expect(registeredClass!.artifactHash.toString()).toEqual(contractClass.artifactHash.toString());
      expect(registeredClass!.privateFunctionsRoot.toString()).toEqual(contractClass.privateFunctionsRoot.toString());
      expect(registeredClass!.packedBytecode.toString('hex')).toEqual(contractClass.packedBytecode.toString('hex'));
      expect(registeredClass!.privateFunctions).toEqual([]);
    });

    it('broadcasts a private function', async () => {
      const constructorArtifact = artifact.functions.find(fn => fn.name == 'constructor');
      if (!constructorArtifact) {
        // If this gets thrown you've probably modified the StatefulTestContract to no longer include constructor.
        // If that's the case you should update this test to use a private function which fits into the bytecode size limit.
        throw new Error('No constructor found in the StatefulTestContract artifact. Does it still exist?');
      }
      const selector = await FunctionSelector.fromNameAndParameters(
        constructorArtifact.name,
        constructorArtifact.parameters,
      );

      const tx = await (await broadcastPrivateFunction(wallet, artifact, selector)).send().wait();
      const logs = await pxe.getContractClassLogs({ txHash: tx.txHash });
      const logData = logs.logs[0].log.toBuffer();

      // To actually trigger this write:
      // From `yarn-project/end-to-end/`
      // AZTEC_GENERATE_TEST_DATA=1 yarn test contract_class_registration.test.ts
      writeTestData('yarn-project/protocol-contracts/fixtures/PrivateFunctionBroadcastedEventData.hex', logData);

      const fetchedClass = await aztecNode.getContractClass(contractClass.id);
      const fetchedFunction = fetchedClass!.privateFunctions[0]!;
      expect(fetchedFunction).toBeDefined();
      expect(fetchedFunction.selector).toEqual(selector);
    });

    it('broadcasts a utility function', async () => {
      const functionArtifact = artifact.functions.find(fn => fn.functionType === FunctionType.UTILITY)!;
      const selector = await FunctionSelector.fromNameAndParameters(functionArtifact);
      const tx = await (await broadcastUtilityFunction(wallet, artifact, selector)).send().wait();
      const logs = await pxe.getContractClassLogs({ txHash: tx.txHash });
      const logData = logs.logs[0].log.toBuffer();

      // To actually trigger this write:
      // From `yarn-project/end-to-end/`
      // AZTEC_GENERATE_TEST_DATA=1 yarn test contract_class_registration.test.ts
      writeTestData('yarn-project/protocol-contracts/fixtures/UtilityFunctionBroadcastedEventData.hex', logData);

      const fetchedClass = await aztecNode.getContractClass(contractClass.id);
      const fetchedFunction = fetchedClass!.utilityFunctions[0]!;
      expect(fetchedFunction).toBeDefined();
      expect(fetchedFunction.selector).toEqual(selector);
    });
  });

  const testDeployingAnInstance = (how: string, deployFn: (toDeploy: ContractInstanceWithAddress) => Promise<void>) =>
    describe(`deploying a contract instance ${how}`, () => {
      let instance: ContractInstanceWithAddress;
      let initArgs: StatefulContractCtorArgs;
      let contract: StatefulTestContract;

      const publishInstance = async (opts: { constructorName?: string; deployer?: AztecAddress } = {}) => {
        const initArgs = [wallet.getAddress(), 42] as StatefulContractCtorArgs;
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
        await deployFn(instance);

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
        const contract = await StatefulTestContract.at(instance.address, wallet);
        return { contract, initArgs, instance, publicKeys };
      };

      describe('using a private constructor', () => {
        beforeAll(async () => {
          ({ instance, initArgs, contract } = await publishInstance());
        });

        it('stores contract instance in the aztec node', async () => {
          // Contract instance deployed event is emitted via private logs.
          const block = await aztecNode.getBlockNumber();
          const logs = await aztecNode.getPrivateLogs(block, 1);
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
          expect(deployed!.publicKeys).toEqual(instance.publicKeys);
          expect(deployed!.salt).toEqual(instance.salt);
          expect(deployed!.deployer).toEqual(instance.deployer);
        });

        it('calls a public function with no init check on the deployed instance', async () => {
          const whom = await AztecAddress.random();
          await contract.methods.increment_public_value_no_init_check(whom, 10).send().wait();
          const stored = await contract.methods.get_public_value(whom).simulate();
          expect(stored).toEqual(10n);
        });

        it('refuses to call a public function with init check if the instance is not initialized', async () => {
          const whom = await AztecAddress.random();
          const receipt = await contract.methods
            .increment_public_value(whom, 10)
            .send()
            .wait({ dontThrowOnRevert: true });
          expect(receipt.status).toEqual(TxStatus.APP_LOGIC_REVERTED);

          // Meanwhile we check we didn't increment the value
          expect(await contract.methods.get_public_value(whom).simulate()).toEqual(0n);
        });

        it('refuses to initialize the instance with wrong args via a private function', async () => {
          await expect(contract.methods.constructor(await AztecAddress.random(), 43).simulate()).rejects.toThrow(
            /initialization hash does not match/i,
          );
        });

        it('initializes the contract and calls a public function', async () => {
          await contract.methods
            .constructor(...initArgs)
            .send()
            .wait();
          const whom = await AztecAddress.random();
          await contract.methods.increment_public_value(whom, 10).send().wait();
          const stored = await contract.methods.get_public_value(whom).simulate();
          expect(stored).toEqual(10n);
        });

        it('refuses to reinitialize the contract', async () => {
          await expect(
            contract.methods
              .constructor(...initArgs)
              .send()
              .wait(),
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
          const receipt = await contract.methods.public_constructor(whom, 43).send().wait({ dontThrowOnRevert: true });
          expect(receipt.status).toEqual(TxStatus.APP_LOGIC_REVERTED);
          expect(await contract.methods.get_public_value(whom).simulate()).toEqual(0n);
        });

        it('initializes the contract and calls a public function', async () => {
          await contract.methods
            .public_constructor(...initArgs)
            .send()
            .wait();
          const whom = await AztecAddress.random();
          await contract.methods.increment_public_value(whom, 10).send().wait();
          const stored = await contract.methods.get_public_value(whom).simulate();
          expect(stored).toEqual(10n);
        });

        it('refuses to reinitialize the contract', async () => {
          await expect(
            contract.methods
              .public_constructor(...initArgs)
              .send()
              .wait(),
          ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
        });
      });
    });

  testDeployingAnInstance('from a wallet', async instance => {
    // Calls the deployer contract directly from a wallet
    const deployMethod = await publishInstance(wallet, instance);
    await deployMethod.send().wait();
  });

  testDeployingAnInstance('from a contract', async instance => {
    // Register the instance to be deployed in the pxe
    await wallet.registerContract({ artifact, instance });
    // Set up the contract that calls the deployer (which happens to be the TestContract) and call it
    const deployer = await TestContract.deploy(wallet).send().deployed();
    await deployer.methods.publish_contract_instance(instance.address).send().wait();
  });

  describe('error scenarios in deployment', () => {
    it('app logic call to an undeployed contract reverts, but can be included', async () => {
      const whom = wallet.getAddress();
      const sender = whom;
      const instance = await t.registerContract(wallet, StatefulTestContract, { initArgs: [whom, sender, 42] });
      // Confirm that the tx reverts with the expected message
      await expect(instance.methods.increment_public_value_no_init_check(whom, 10).simulate()).rejects.toThrow(
        /No bytecode/,
      );
      // This time, don't throw on revert and confirm that the tx is included
      // despite reverting in app logic because of the call to a non-existent contract
      const tx = await instance.methods
        .increment_public_value_no_init_check(whom, 10)
        .send()
        .wait({ dontThrowOnRevert: true });
      expect(tx.status).toEqual(TxStatus.APP_LOGIC_REVERTED);
    });

    it('refuses to deploy an instance from a different deployer', async () => {
      const instance = await getContractInstanceFromInstantiationParams(artifact, {
        constructorArgs: [await AztecAddress.random(), 42],
        deployer: await AztecAddress.random(),
      });
      await expect(publishInstance(wallet, instance)).rejects.toThrow(/does not match/i);
    });
  });
});
