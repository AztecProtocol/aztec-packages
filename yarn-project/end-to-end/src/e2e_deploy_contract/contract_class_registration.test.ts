import {
  AztecAddress,
  type AztecNode,
  type ContractArtifact,
  type ContractClassWithId,
  type ContractInstanceWithAddress,
  type DebugLogger,
  type FieldsOf,
  Fr,
  type PXE,
  type TxReceipt,
  TxStatus,
  type Wallet,
  getContractClassFromArtifact,
  getContractInstanceFromDeployParams,
} from '@aztec/aztec.js';
import {
  broadcastPrivateFunction,
  broadcastUnconstrainedFunction,
  deployInstance,
  registerContractClass,
} from '@aztec/aztec.js/deployment';
import { type ContractClassIdPreimage, PublicKeys, computeContractClassId } from '@aztec/circuits.js';
import { FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { writeTestData } from '@aztec/foundation/testing';
import { StatefulTestContract, TokenContractArtifact } from '@aztec/noir-contracts.js';
import { TestContract } from '@aztec/noir-contracts.js/Test';

import { DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { DeployTest, type StatefulContractCtorArgs } from './deploy_test.js';

describe('e2e_deploy_contract contract class registration', () => {
  const t = new DeployTest('contract class');

  let pxe: PXE;
  let logger: DebugLogger;
  let wallet: Wallet;
  let aztecNode: AztecNode;

  beforeAll(async () => {
    ({ pxe, logger, wallet, aztecNode } = await t.setup());
  });

  afterAll(() => t.teardown());

  let artifact: ContractArtifact;
  let contractClass: ContractClassWithId & ContractClassIdPreimage;
  let registrationTxReceipt: FieldsOf<TxReceipt>;

  beforeAll(async () => {
    artifact = StatefulTestContract.artifact;
    registrationTxReceipt = await registerContractClass(wallet, artifact, false).then(c => c.send().wait());
    contractClass = getContractClassFromArtifact(artifact);

    // TODO(#10007) Remove this call. Node should get the bytecode from the event broadcast.
    expect(await aztecNode.getContractClass(contractClass.id)).toBeUndefined();
    await aztecNode.addContractClass({ ...contractClass, privateFunctions: [], unconstrainedFunctions: [] });
  });

  describe('registering a contract class', () => {
    it('optionally emits public bytecode', async () => {
      const registrationTxReceipt = await registerContractClass(wallet, TestContract.artifact, true).then(c =>
        c.send().wait(),
      );
      const logs = await aztecNode.getContractClassLogs({ txHash: registrationTxReceipt.txHash });
      expect(logs.logs.length).toEqual(1);
    });

    // TODO(#10007) Remove this test. We should always broadcast public bytecode.
    it('bypasses broadcast if exceeds bytecode limit for event size', async () => {
      const logs = await aztecNode.getContractClassLogs({ txHash: registrationTxReceipt.txHash });
      expect(logs.logs.length).toEqual(0);
    });

    // TODO(#10007) Remove this test as well.
    it('starts archiver with pre-registered common contracts', async () => {
      const classId = computeContractClassId(getContractClassFromArtifact(TokenContractArtifact));
      expect(await aztecNode.getContractClass(classId)).not.toBeUndefined();
    });

    it('registers the contract class on the node', async () => {
      // TODO(#10007) Enable this.
      // const logs = await aztecNode.getContractClassLogs({ txHash: registrationTxReceipt.txHash });
      // expect(logs.logs.length).toEqual(1);
      // const logData = logs.logs[0].log.data;
      // writeTestData('yarn-project/protocol-contracts/fixtures/ContractClassRegisteredEventData.hex', logData);

      const registeredClass = await aztecNode.getContractClass(contractClass.id);
      expect(registeredClass).toBeDefined();
      expect(registeredClass!.artifactHash.toString()).toEqual(contractClass.artifactHash.toString());
      expect(registeredClass!.privateFunctionsRoot.toString()).toEqual(contractClass.privateFunctionsRoot.toString());
      expect(registeredClass!.packedBytecode.toString('hex')).toEqual(contractClass.packedBytecode.toString('hex'));
      expect(registeredClass!.publicFunctions).toEqual(contractClass.publicFunctions);
      expect(registeredClass!.privateFunctions).toEqual([]);
    });

    it('broadcasts a private function', async () => {
      const constructorArtifact = artifact.functions.find(fn => fn.name == 'constructor');
      if (!constructorArtifact) {
        // If this gets thrown you've probably modified the StatefulTestContract to no longer include constructor.
        // If that's the case you should update this test to use a private function which fits into the bytecode size limit.
        throw new Error('No constructor found in the StatefulTestContract artifact. Does it still exist?');
      }
      const selector = FunctionSelector.fromNameAndParameters(constructorArtifact.name, constructorArtifact.parameters);

      const tx = await (await broadcastPrivateFunction(wallet, artifact, selector)).send().wait();
      const logs = await pxe.getContractClassLogs({ txHash: tx.txHash });
      const logData = logs.logs[0].log.data;
      writeTestData('yarn-project/protocol-contracts/fixtures/PrivateFunctionBroadcastedEventData.hex', logData);

      const fetchedClass = await aztecNode.getContractClass(contractClass.id);
      const fetchedFunction = fetchedClass!.privateFunctions[0]!;
      expect(fetchedFunction).toBeDefined();
      expect(fetchedFunction.selector).toEqual(selector);
    });

    it('broadcasts an unconstrained function', async () => {
      const functionArtifact = artifact.functions.find(fn => fn.functionType === FunctionType.UNCONSTRAINED)!;
      const selector = FunctionSelector.fromNameAndParameters(functionArtifact);
      const tx = await (await broadcastUnconstrainedFunction(wallet, artifact, selector)).send().wait();
      const logs = await pxe.getContractClassLogs({ txHash: tx.txHash });
      const logData = logs.logs[0].log.data;
      writeTestData('yarn-project/protocol-contracts/fixtures/UnconstrainedFunctionBroadcastedEventData.hex', logData);

      const fetchedClass = await aztecNode.getContractClass(contractClass.id);
      const fetchedFunction = fetchedClass!.unconstrainedFunctions[0]!;
      expect(fetchedFunction).toBeDefined();
      expect(fetchedFunction.selector).toEqual(selector);
    });
  });

  const testDeployingAnInstance = (how: string, deployFn: (toDeploy: ContractInstanceWithAddress) => Promise<void>) =>
    describe(`deploying a contract instance ${how}`, () => {
      let instance: ContractInstanceWithAddress;
      let initArgs: StatefulContractCtorArgs;
      let contract: StatefulTestContract;

      const deployInstance = async (opts: { constructorName?: string; deployer?: AztecAddress } = {}) => {
        const initArgs = [wallet.getAddress(), wallet.getAddress(), 42] as StatefulContractCtorArgs;
        const salt = Fr.random();
        const publicKeys = PublicKeys.random();
        const instance = getContractInstanceFromDeployParams(artifact, {
          constructorArgs: initArgs,
          salt,
          publicKeys,
          constructorArtifact: opts.constructorName,
          deployer: opts.deployer,
        });
        const { address, contractClassId } = instance;
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
          ({ instance, initArgs, contract } = await deployInstance());
        });

        it('stores contract instance in the aztec node', async () => {
          // Contract instance deployed event is emitted via private logs.
          const block = await aztecNode.getBlockNumber();
          const logs = await aztecNode.getPrivateLogs(block, 1);
          expect(logs.length).toBe(1);
          writeTestData(
            'yarn-project/protocol-contracts/fixtures/ContractInstanceDeployedEventData.hex',
            logs[0].toBuffer(),
          );

          const deployed = await aztecNode.getContract(instance.address);
          expect(deployed).toBeDefined();
          expect(deployed!.address).toEqual(instance.address);
          expect(deployed!.contractClassId).toEqual(contractClass.id);
          expect(deployed!.initializationHash).toEqual(instance.initializationHash);
          expect(deployed!.publicKeys).toEqual(instance.publicKeys);
          expect(deployed!.salt).toEqual(instance.salt);
          expect(deployed!.deployer).toEqual(instance.deployer);
        });

        it('calls a public function with no init check on the deployed instance', async () => {
          const whom = AztecAddress.random();
          await contract.methods
            .increment_public_value_no_init_check(whom, 10)
            .send({ skipPublicSimulation: true })
            .wait();
          const stored = await contract.methods.get_public_value(whom).simulate();
          expect(stored).toEqual(10n);
        });

        it('refuses to call a public function with init check if the instance is not initialized', async () => {
          const whom = AztecAddress.random();
          const receipt = await contract.methods
            .increment_public_value(whom, 10)
            .send({ skipPublicSimulation: true })
            .wait({ dontThrowOnRevert: true });
          expect(receipt.status).toEqual(TxStatus.APP_LOGIC_REVERTED);

          // Meanwhile we check we didn't increment the value
          expect(await contract.methods.get_public_value(whom).simulate()).toEqual(0n);
        });

        it('refuses to initialize the instance with wrong args via a private function', async () => {
          await expect(
            contract.methods.constructor(AztecAddress.random(), AztecAddress.random(), 43).prove(),
          ).rejects.toThrow(/initialization hash does not match/i);
        });

        it('initializes the contract and calls a public function', async () => {
          await contract.methods
            .constructor(...initArgs)
            .send()
            .wait();
          const whom = AztecAddress.random();
          await contract.methods.increment_public_value(whom, 10).send({ skipPublicSimulation: true }).wait();
          const stored = await contract.methods.get_public_value(whom).simulate();
          expect(stored).toEqual(10n);
        });

        it('refuses to reinitialize the contract', async () => {
          await expect(
            contract.methods
              .constructor(...initArgs)
              .send({ skipPublicSimulation: true })
              .wait(),
            // TODO(https://github.com/AztecProtocol/aztec-packages/issues/5818): Make these a fixed error after transition.
          ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
        });
      });

      describe('using a public constructor', () => {
        const ignoredArg = AztecAddress.random();
        beforeAll(async () => {
          ({ instance, initArgs, contract } = await deployInstance({
            constructorName: 'public_constructor',
          }));
        });

        it('refuses to initialize the instance with wrong args via a public function', async () => {
          const whom = AztecAddress.random();
          const receipt = await contract.methods
            .public_constructor(whom, ignoredArg, 43)
            .send({ skipPublicSimulation: true })
            .wait({ dontThrowOnRevert: true });
          expect(receipt.status).toEqual(TxStatus.APP_LOGIC_REVERTED);
          expect(await contract.methods.get_public_value(whom).simulate()).toEqual(0n);
        });

        it('initializes the contract and calls a public function', async () => {
          await contract.methods
            .public_constructor(...initArgs)
            .send()
            .wait();
          const whom = AztecAddress.random();
          await contract.methods.increment_public_value(whom, 10).send({ skipPublicSimulation: true }).wait();
          const stored = await contract.methods.get_public_value(whom).simulate();
          expect(stored).toEqual(10n);
        });

        it('refuses to reinitialize the contract', async () => {
          await expect(
            contract.methods
              .public_constructor(...initArgs)
              .send({ skipPublicSimulation: true })
              .wait(),
          ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
        });
      });
    });

  testDeployingAnInstance('from a wallet', async instance => {
    // Calls the deployer contract directly from a wallet
    await deployInstance(wallet, instance).send().wait();
  });

  testDeployingAnInstance('from a contract', async instance => {
    // Register the instance to be deployed in the pxe
    await wallet.registerContract({ artifact, instance });
    // Set up the contract that calls the deployer (which happens to be the TestContract) and call it
    const deployer = await TestContract.deploy(wallet).send().deployed();
    await deployer.methods.deploy_contract(instance.address).send().wait();
  });

  describe('error scenarios in deployment', () => {
    it('app logic call to an undeployed contract reverts, but can be included', async () => {
      const whom = wallet.getAddress();
      const outgoingViewer = whom;
      const instance = await t.registerContract(wallet, StatefulTestContract, { initArgs: [whom, outgoingViewer, 42] });
      // Confirm that the tx reverts with the expected message
      await expect(instance.methods.increment_public_value_no_init_check(whom, 10).send().wait()).rejects.toThrow(
        /No bytecode/,
      );
      // This time, don't throw on revert and confirm that the tx is included
      // despite reverting in app logic because of the call to a non-existent contract
      const tx = await instance.methods
        .increment_public_value_no_init_check(whom, 10)
        .send({ skipPublicSimulation: true })
        .wait({ dontThrowOnRevert: true });
      expect(tx.status).toEqual(TxStatus.APP_LOGIC_REVERTED);
    });

    it('refuses to deploy an instance from a different deployer', () => {
      const instance = getContractInstanceFromDeployParams(artifact, {
        constructorArgs: [AztecAddress.random(), AztecAddress.random(), 42],
        deployer: AztecAddress.random(),
      });
      expect(() => deployInstance(wallet, instance)).toThrow(/does not match/i);
    });
  });
});
