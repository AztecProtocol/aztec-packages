import { getSchnorrAccountContractAddress } from '@aztec/accounts/schnorr';
import { Fr, type Wallet, getContractClassFromArtifact } from '@aztec/aztec.js';
import { registerContractClass } from '@aztec/aztec.js/deployment';
import {
  type AztecAddress,
  MINIMUM_UPDATE_DELAY,
  PublicDataTreeLeaf,
  ScheduledDelayChange,
  ScheduledValueChange,
  UPDATED_CLASS_IDS_SLOT,
  UPDATES_SCHEDULED_VALUE_CHANGE_LEN,
  computeSharedMutableHashSlot,
  deriveSigningKey,
  getContractInstanceFromDeployParams,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot, deriveStorageSlotInMap } from '@aztec/circuits.js/hash';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { UpdatableContract } from '@aztec/noir-contracts.js/Updatable';
import { UpdatedContract, UpdatedContractArtifact } from '@aztec/noir-contracts.js/Updated';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { setup } from './fixtures/utils.js';

// Set the update delay in genesis data so it's feasible to test in an e2e test
const DEFAULT_TEST_UPDATE_DELAY = 10;

describe('e2e_contract_updates', () => {
  let wallet: Wallet;
  let teardown: () => Promise<void>;
  let contract: UpdatableContract;
  let updatedContractClassId: Fr;

  const setupScheduledDelay = async (constructorArgs: any[], salt: Fr, deployer: AztecAddress) => {
    const predictedInstance = await getContractInstanceFromDeployParams(UpdatableContract.artifact, {
      constructorArgs,
      salt,
      deployer,
    });

    const sharedMutableSlot = await deriveStorageSlotInMap(new Fr(UPDATED_CLASS_IDS_SLOT), predictedInstance.address);

    const leaves: PublicDataTreeLeaf[] = [];

    const writeToTree = async (storageSlot: Fr, value: Fr) => {
      leaves.push(
        new PublicDataTreeLeaf(
          await computePublicDataTreeLeafSlot(ProtocolContractAddress.ContractInstanceDeployer, storageSlot),
          value,
        ),
      );
    };
    const valueChange = ScheduledValueChange.empty(1);
    const delayChange = new ScheduledDelayChange(undefined, 0, DEFAULT_TEST_UPDATE_DELAY);
    await valueChange.writeToTree(sharedMutableSlot, writeToTree);
    await delayChange.writeToTree(sharedMutableSlot, writeToTree);

    const updatePreimage = [delayChange.toField(), ...valueChange.toFields()];
    const updateHash = await poseidon2Hash(updatePreimage);

    const hashSlot = computeSharedMutableHashSlot(sharedMutableSlot, UPDATES_SCHEDULED_VALUE_CHANGE_LEN);

    await writeToTree(hashSlot, updateHash);

    return leaves;
  };

  beforeEach(async () => {
    const senderPrivateKey = Fr.random();
    const signingKey = deriveSigningKey(senderPrivateKey);
    const salt = Fr.ONE;
    const initialFundedAccounts = [
      {
        secret: senderPrivateKey,
        signingKey,
        salt,
        address: await getSchnorrAccountContractAddress(senderPrivateKey, salt, signingKey),
      },
    ];

    const constructorArgs = [1n];
    const genesisPublicData = await setupScheduledDelay(constructorArgs, salt, initialFundedAccounts[0].address);

    ({ teardown, wallet } = await setup(1, {
      genesisPublicData,
      initialFundedAccounts,
      assumeProvenThrough: Number.MAX_SAFE_INTEGER,
    }));

    contract = await UpdatableContract.deploy(wallet, constructorArgs[0])
      .send({ contractAddressSalt: salt })
      .deployed();

    const registerMethod = await registerContractClass(wallet, UpdatedContractArtifact);
    await registerMethod.send().wait();

    updatedContractClassId = (await getContractClassFromArtifact(UpdatedContractArtifact)).id;
  });

  const mineBlocks = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await contract.methods.get_update_delay().send().wait();
    }
  };

  afterAll(() => teardown());

  it('should update the contract', async () => {
    expect(await contract.methods.get_private_value().simulate()).toEqual(1n);
    expect(await contract.methods.get_public_value().simulate()).toEqual(1n);
    await contract.methods.update_to(updatedContractClassId).send().wait();
    // Mine some blocks
    await mineBlocks(DEFAULT_TEST_UPDATE_DELAY);
    // Should be updated now
    const updatedContract = await UpdatedContract.at(contract.address, wallet);
    // Call a private method that wasn't available in the previous contract
    await updatedContract.methods.set_private_value().send().wait();
    // Read state that was changed by the previous tx
    expect(await updatedContract.methods.get_private_value().simulate()).toEqual(27n);

    // Call a public method with a new implementation
    await updatedContract.methods.set_public_value().send().wait();
    expect(await updatedContract.methods.get_public_value().simulate()).toEqual(27n);
  });

  it('should change the update delay and then update the contract', async () => {
    expect(await contract.methods.get_update_delay().simulate()).toEqual(BigInt(DEFAULT_TEST_UPDATE_DELAY));

    // Increases the delay so it should happen immediately
    await contract.methods
      .set_update_delay(MINIMUM_UPDATE_DELAY + 1)
      .send()
      .wait();

    expect(await contract.methods.get_update_delay().simulate()).toEqual(BigInt(MINIMUM_UPDATE_DELAY + 1));

    await contract.methods.update_to(updatedContractClassId).send().wait();
    await mineBlocks(MINIMUM_UPDATE_DELAY + 1);

    // Should be updated now
    const updatedContract = await UpdatedContract.at(contract.address, wallet);
    // Call a private method that wasn't available in the previous contract
    await updatedContract.methods.set_private_value().send().wait();
  });

  it('should not allow to change the delay to a value lower than the minimum', async () => {
    await expect(
      contract.methods
        .set_update_delay(MINIMUM_UPDATE_DELAY - 1)
        .send()
        .wait(),
    ).rejects.toThrow('New update delay is too low');
  });

  it('should not allow to instantiate a contract with an updated class before the update happens', async () => {
    await expect(UpdatedContract.at(contract.address, wallet)).rejects.toThrow(
      'Could not update contract to a class different from the current one',
    );
  });
});
