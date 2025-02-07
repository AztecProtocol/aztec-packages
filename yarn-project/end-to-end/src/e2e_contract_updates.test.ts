import { getSchnorrAccountContractAddress } from '@aztec/accounts/schnorr';
import { Fr, type Logger, type Wallet, getContractClassFromArtifact } from '@aztec/aztec.js';
import { registerContractClass } from '@aztec/aztec.js/deployment';
import {
  type AztecAddress,
  PublicDataTreeLeaf,
  ScheduledDelayChange,
  ScheduledValueChange,
  UPDATED_CLASS_IDS_SLOT,
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

// Set the update delay to 10 blocks so it's feasible to test in an e2e test
const UPDATE_DELAY = 10;

describe('e2e_contract_updates', () => {
  let wallet: Wallet;
  let teardown: () => Promise<void>;
  let contract: UpdatableContract;
  let updatedContractClassId: Fr;
  let logger: Logger;

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
    const valueChange = ScheduledValueChange.empty();
    const delayChange = new ScheduledDelayChange(undefined, 0, UPDATE_DELAY);
    await valueChange.writeToTree(sharedMutableSlot, writeToTree);
    await delayChange.writeToTree(sharedMutableSlot, writeToTree);

    const updatePreimage = [...valueChange.toFields(), delayChange.toField()];
    const updateHash = await poseidon2Hash(updatePreimage);

    const hashSlot = await computeSharedMutableHashSlot(sharedMutableSlot);

    await writeToTree(hashSlot, updateHash);

    return leaves;
  };

  beforeAll(async () => {
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

    ({ teardown, wallet, logger } = await setup(1, {
      genesisPublicData,
      initialFundedAccounts,
    }));

    contract = await UpdatableContract.deploy(wallet, constructorArgs[0])
      .send({ contractAddressSalt: salt })
      .deployed();

    const registerMethod = await registerContractClass(wallet, UpdatedContractArtifact);
    await registerMethod.send().wait();

    updatedContractClassId = (await getContractClassFromArtifact(UpdatedContractArtifact)).id;
  });

  afterAll(() => teardown());

  it('should update the contract', async () => {
    expect(await contract.methods.get_private_value().simulate()).toEqual(1n);
    expect(await contract.methods.get_public_value().simulate()).toEqual(1n);
    await contract.methods.update_to(updatedContractClassId).send().wait();
    // Mine some blocks
    logger.info('Waiting for update to apply');
    for (let i = 0; i < UPDATE_DELAY * 2; i++) {
      try {
        await contract.methods.set_public_value(1n).send().wait();
      } catch (e) {
        // Fails when updated since the method doesn't exist anymore
        break;
      }
    }
    logger.info('Done waiting');

    const updatedContract = await UpdatedContract.at(contract.address, wallet);
    // Call a private method that wasn't available in the previous contract
    await updatedContract.methods.set_private_value().send().wait();
    // Read state that was changed by the previous tx
    expect(await updatedContract.methods.get_private_value().simulate()).toEqual(27n);

    // Call a public method with a new implementation
    await updatedContract.methods.set_public_value().send().wait();
    expect(await updatedContract.methods.get_public_value().simulate()).toEqual(27n);
  });
});
