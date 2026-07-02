import { getSchnorrInitializerlessAccountContractAddress } from '@aztec/accounts/schnorr';
import { fastForwardContractUpdate, getContractClassFromArtifact } from '@aztec/aztec.js/contracts';
import { publishContractClass } from '@aztec/aztec.js/deployment';
import { Fr, GrumpkinScalar } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { CheatCodes } from '@aztec/aztec/testing';
import { MINIMUM_UPDATE_DELAY, UPDATED_CLASS_IDS_SLOT } from '@aztec/constants';
import { UpdatableContract } from '@aztec/noir-test-contracts.js/Updatable';
import { UpdatedContract, UpdatedContractArtifact } from '@aztec/noir-test-contracts.js/Updated';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type ContractInstanceWithAddress, getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import {
  DelayedPublicMutableValuesWithHash,
  ScheduledDelayChange,
  ScheduledValueChange,
} from '@aztec/stdlib/delayed-public-mutable';
import { computePublicDataTreeLeafSlot, deriveStorageSlotInMap } from '@aztec/stdlib/hash';
import type { AztecNodeDebug } from '@aztec/stdlib/interfaces/client';
import { PublicDataTreeLeaf } from '@aztec/stdlib/trees';

import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { AutomineTestContext } from '../automine_test_context.js';

// Set the update delay in genesis data so it's feasible to test in an e2e test.
// The protocol enforces `MINIMUM_UPDATE_DELAY` (600 seconds, see constants.gen.ts), so we use that
// as the test delay: it's the smallest the chain will accept, which keeps `warpL2TimeAtLeastBy`
// times reasonable while still exercising the same code path.
const DEFAULT_TEST_UPDATE_DELAY = BigInt(MINIMUM_UPDATE_DELAY);

const INITIAL_UPDATABLE_CONTRACT_VALUE = 1n;
// Constant copied over from Updated contract
const UPDATED_CONTRACT_PUBLIC_VALUE = 27n;

// Tests the contract class update mechanism: scheduling an upgrade, time-warping past the delay,
// and verifying the new class is active. Also tests simulation overrides for post-upgrade calls.
// Uses setup(0, AUTOMINE_E2E_OPTS) with genesisPublicData and a deterministic initializerless account
// in additionallyFundedAccounts (whose address is known before setup so the delay can be seeded in
// genesis for it). (v5: was setup(1, …) with initialFundedAccounts; the renamed option and
// initializerless account are setup-mechanics changes, not category changes.)
describe('automine/contracts/contract_updates', () => {
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;
  let contract: UpdatableContract;
  let instance: ContractInstanceWithAddress;
  let updatedContractClassId: Fr;
  let cheatCodes: CheatCodes;
  let aztecNode: AztecNode & AztecNodeDebug;

  const setupScheduledDelay = async (constructorArgs: any[], salt: Fr, deployer: AztecAddress) => {
    const predictedInstance = await getContractInstanceFromInstantiationParams(UpdatableContract.artifact, {
      constructorArgs,
      salt,
      deployer,
    });

    const delayedPublicMutableSlot = await deriveStorageSlotInMap(
      new Fr(UPDATED_CLASS_IDS_SLOT),
      predictedInstance.address,
    );

    const leaves: PublicDataTreeLeaf[] = [];

    const writeToTree = async (storageSlot: Fr, value: Fr) => {
      leaves.push(
        new PublicDataTreeLeaf(
          await computePublicDataTreeLeafSlot(ProtocolContractAddress.ContractInstanceRegistry, storageSlot),
          value,
        ),
      );
    };

    const valueChange = ScheduledValueChange.empty(1);
    const delayChange = new ScheduledDelayChange(undefined, DEFAULT_TEST_UPDATE_DELAY, 0n);
    const delayedPublicMutableValuesWithHash = new DelayedPublicMutableValuesWithHash(valueChange, delayChange);

    await delayedPublicMutableValuesWithHash.writeToTree(delayedPublicMutableSlot, writeToTree);

    return leaves;
  };

  beforeEach(async () => {
    const senderPrivateKey = Fr.random();
    const signingKey = GrumpkinScalar.random();
    const salt = Fr.ONE;
    // Use a deterministic initializerless account whose address we know before setup, so the scheduled
    // delay can be seeded in genesis public data for it. We fund it and create it ourselves below.
    const account = {
      secret: senderPrivateKey,
      signingKey,
      salt,
      type: 'schnorr_initializerless' as const,
      address: await getSchnorrInitializerlessAccountContractAddress(signingKey, salt, senderPrivateKey),
    };
    defaultAccountAddress = account.address;

    const constructorArgs = [INITIAL_UPDATABLE_CONTRACT_VALUE];
    const genesisPublicData = await setupScheduledDelay(constructorArgs, salt, account.address);

    ({ aztecNode, teardown, wallet, cheatCodes } = (
      await AutomineTestContext.setup({
        numberOfAccounts: 0,
        genesisPublicData,
        additionallyFundedAccounts: [account],
      })
    ).context);
    await wallet.createSchnorrInitializerlessAccount(account.secret, account.salt, account.signingKey);

    ({ contract, instance } = await UpdatableContract.deploy(wallet, constructorArgs[0], { salt }).send({
      from: defaultAccountAddress,
    }));

    const registerMethod = await publishContractClass(wallet, UpdatedContractArtifact);
    await registerMethod.send({ from: defaultAccountAddress });

    updatedContractClassId = (await getContractClassFromArtifact(UpdatedContractArtifact)).id;
  });

  afterEach(() => teardown());

  // Schedules an update to UpdatedContractClassId, warps L2 time past DEFAULT_TEST_UPDATE_DELAY,
  // then calls new private and public methods only available in the updated class.
  it('should update the contract', async () => {
    expect(
      (await contract.methods.get_private_value(defaultAccountAddress).simulate({ from: defaultAccountAddress }))
        .result,
    ).toEqual(INITIAL_UPDATABLE_CONTRACT_VALUE);
    expect((await contract.methods.get_public_value().simulate({ from: defaultAccountAddress })).result).toEqual(
      INITIAL_UPDATABLE_CONTRACT_VALUE,
    );
    await contract.methods.update_to(updatedContractClassId).send({ from: defaultAccountAddress });
    // Warp time to get past the timestamp of change where the update takes effect so the latest
    // header's timestamp (which the PXE uses to read the current class id) is past the update's
    // timestampOfChange.
    await cheatCodes.warpL2TimeAtLeastBy(aztecNode, DEFAULT_TEST_UPDATE_DELAY);
    // Should be updated now
    await wallet.registerContract(instance, UpdatedContract.artifact);
    const updatedContract = UpdatedContract.at(contract.address, wallet);
    // Call a private method that wasn't available in the previous contract
    await updatedContract.methods.set_private_value().send({ from: defaultAccountAddress });
    // Read state that was changed by the previous tx
    expect(
      (await updatedContract.methods.get_private_value(defaultAccountAddress).simulate({ from: defaultAccountAddress }))
        .result,
    ).toEqual(UPDATED_CONTRACT_PUBLIC_VALUE);

    // Call a public method with a new implementation
    await updatedContract.methods.set_public_value().send({ from: defaultAccountAddress });
    expect((await updatedContract.methods.get_public_value().simulate({ from: defaultAccountAddress })).result).toEqual(
      UPDATED_CONTRACT_PUBLIC_VALUE,
    );
  });

  // Increases the delay by 1, schedules an update, warps past the new delay, verifies the update
  // took effect.
  it('should change the update delay and then update the contract', async () => {
    expect((await contract.methods.get_update_delay().simulate({ from: defaultAccountAddress })).result).toEqual(
      BigInt(DEFAULT_TEST_UPDATE_DELAY),
    );

    // Increases the delay so it should happen immediately
    await contract.methods
      .set_update_delay(BigInt(DEFAULT_TEST_UPDATE_DELAY) + 1n)
      .send({ from: defaultAccountAddress });

    expect((await contract.methods.get_update_delay().simulate({ from: defaultAccountAddress })).result).toEqual(
      BigInt(DEFAULT_TEST_UPDATE_DELAY) + 1n,
    );

    await contract.methods.update_to(updatedContractClassId).send({ from: defaultAccountAddress });
    await cheatCodes.warpL2TimeAtLeastBy(aztecNode, BigInt(DEFAULT_TEST_UPDATE_DELAY) + 1n);

    // Should be updated now
    await wallet.registerContract(instance, UpdatedContract.artifact);
    const updatedContract = UpdatedContract.at(contract.address, wallet);
    // Call a private method that wasn't available in the previous contract
    await updatedContract.methods.set_private_value().send({ from: defaultAccountAddress });
  });

  // Tries to set a delay below MINIMUM_UPDATE_DELAY and expects a revert "New update delay is too low".
  it('should not allow to change the delay to a value lower than the minimum', async () => {
    await expect(
      contract.methods.set_update_delay(BigInt(MINIMUM_UPDATE_DELAY) - 1n).simulate({ from: defaultAccountAddress }),
    ).rejects.toThrow('New update delay is too low');
  });

  // Tries to register the instance against UpdatedContract.artifact before the upgrade window passes;
  // expects the PXE to reject with a class mismatch error.
  it('should not allow to instantiate a contract with an updated class before the update happens', async () => {
    await expect(wallet.registerContract(instance, UpdatedContract.artifact)).rejects.toThrow(
      'Could not update contract to a class different from the current one',
    );
  });

  // UpdatableContract's `set_public_value(Field)` and UpdatedContract's `set_public_value()`
  // have different function selectors. Without an upgrade, only the deployed Updatable's
  // (Field) selector exists; with a fastForwardContractUpdate override, the AVM dispatches
  // against UpdatedContract's bytecode and the no-args selector resolves.
  // Asserts that without overrides the call fails, with overrides it succeeds, and real storage is unaffected.
  it('fastForwardContractUpdate enables simulation of post-upgrade public calls', async () => {
    // Local construction with the new artifact - no PXE/wallet side effect, no chain mutation.
    const updatedContract = UpdatedContract.at(contract.address, wallet);

    // Without overrides, UpdatedContract's no-args selector doesn't match the deployed class.
    await expect(
      updatedContract.methods.set_public_value().simulate({ from: defaultAccountAddress }),
    ).rejects.toThrow();

    // With the fastForwardContractUpdate overrides, the AVM dispatches against UpdatedContract's
    // bytecode and the call simulates successfully.
    const overrides = await fastForwardContractUpdate({
      instanceAddress: contract.address,
      newClassId: updatedContractClassId,
      node: aztecNode,
    });
    await expect(
      updatedContract.methods.set_public_value().simulate({ from: defaultAccountAddress, overrides }),
    ).resolves.toBeDefined();

    // Chain state is untouched: the original Updatable's set_public_value(Field) still simulates fine.
    await expect(
      contract.methods.set_public_value(5678n).simulate({ from: defaultAccountAddress }),
    ).resolves.toBeDefined();
  });

  // UpdatedContract.set_private_value is a private function that doesn't exist on UpdatableContract.
  // For PXE-side ACIR dispatch to find it, the artifact must be registered locally first via
  // wallet.registerContractClass; the helper itself only takes the class id.
  // Asserts that without local artifact registration the call fails, with it the call succeeds under overrides.
  it('fastForwardContractUpdate enables simulation of post-upgrade private calls', async () => {
    const updatedContract = UpdatedContract.at(contract.address, wallet);

    // Without overrides (and without local artifact registration), the new private function isn't
    // available on the deployed class.
    await expect(
      updatedContract.methods.set_private_value().simulate({ from: defaultAccountAddress }),
    ).rejects.toThrow();

    // Register the new artifact in the local PXE so the ACIR simulator can find its private functions.
    await wallet.registerContractClass(UpdatedContract.artifact);

    const overrides = await fastForwardContractUpdate({
      instanceAddress: contract.address,
      newClassId: updatedContractClassId,
      node: aztecNode,
    });
    await expect(
      updatedContract.methods.set_private_value().simulate({ from: defaultAccountAddress, overrides }),
    ).resolves.toBeDefined();
  });
});
