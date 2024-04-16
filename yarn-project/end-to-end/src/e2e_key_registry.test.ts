import { AztecAddress, Fr, type PXE, type Wallet } from '@aztec/aztec.js';
import { GeneratorIndex } from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { KeyRegistryContract, StateVarsContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 100_000;

describe('SharedMutablePrivateGetter', () => {
  let keyRegistry: KeyRegistryContract;
  let stateVarsContract: StateVarsContract;
  let pxe: PXE;
  jest.setTimeout(TIMEOUT);

  let wallet: Wallet;

  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ teardown, wallet, pxe } = await setup(2));
    stateVarsContract = await StateVarsContract.deploy(wallet).send().deployed();
    keyRegistry = await KeyRegistryContract.deploy(wallet).send().deployed();
  }, 30_000);

  const delay = async (blocks: number) => {
    for (let i = 0; i < blocks; i++) {
      await stateVarsContract.methods.delay().send().wait();
    }
  };

  afterAll(() => teardown());

  describe('failure cases', () => {
    let accountAddedToRegistry: AztecAddress;

    describe('should fail registering with mismatched nullifier public key', () => {
      const partialAddress = new Fr(69);

      const masterNullifierPublicKey = new Fr(12);
      const masterIncomingViewingPublicKey = new Fr(34);
      const masterOutgoingViewingPublicKey = new Fr(56);
      const masterTaggingPublicKey = new Fr(78);

      const publicKeysHash = poseidon2Hash([
        masterNullifierPublicKey,
        masterIncomingViewingPublicKey,
        masterOutgoingViewingPublicKey,
        masterTaggingPublicKey,
        GeneratorIndex.PUBLIC_KEYS_HASH,
      ]);

      // We hash the partial address and the public keys hash to get the account address
      // TODO(#5726): Should GeneratorIndex.CONTRACT_ADDRESS be removed given that we introduced CONTRACT_ADDRESS_V1?
      // TODO(#5726): Move the following line to AztecAddress class?
      accountAddedToRegistry = poseidon2Hash([partialAddress, publicKeysHash, GeneratorIndex.CONTRACT_ADDRESS_V1]);

      it('should fail registering with mismatched address', async () => {
        const mismatchedAddress = accountAddedToRegistry.add(new Fr(1));

        await expect(
          keyRegistry
            .withWallet(wallet)
            .methods.register(
              AztecAddress.fromField(mismatchedAddress),
              partialAddress,
              masterNullifierPublicKey,
              masterIncomingViewingPublicKey,
              masterOutgoingViewingPublicKey,
              masterTaggingPublicKey,
              masterNullifierPublicKey,
            )
            .send()
            .wait(),
        ).rejects.toThrow('Computed address does not match supplied address');
      });

      it('should fail registering with mismatched nullifier public key', async () => {
        const mismatchedMasterNullifierPublicKey = masterNullifierPublicKey.add(new Fr(1));

        await expect(
          keyRegistry
            .withWallet(wallet)
            .methods.register(
              AztecAddress.fromField(accountAddedToRegistry),
              partialAddress,
              mismatchedMasterNullifierPublicKey,
              masterIncomingViewingPublicKey,
              masterOutgoingViewingPublicKey,
              masterTaggingPublicKey,
              masterNullifierPublicKey,
            )
            .send()
            .wait(),
        ).rejects.toThrow('Computed address does not match supplied address');
      });

      it('should fail registering a 0 address', async () => {
        await expect(
          keyRegistry
            .withWallet(wallet)
            .methods.register(
              AztecAddress.fromField(accountAddedToRegistry),
              partialAddress,
              masterNullifierPublicKey,
              masterIncomingViewingPublicKey,
              masterOutgoingViewingPublicKey,
              masterTaggingPublicKey,
              new Fr(0),
            )
            .send()
            .wait(),
        ).rejects.toThrow('New nullifier public key must be non-zero');
      });
    });
  });

  describe('key rotation flow', () => {
    let accountAddedToRegistry: AztecAddress;

    it('should generate and register with original keys', async () => {
      const partialAddress = new Fr(69);

      const masterNullifierPublicKey = new Fr(12);
      const masterIncomingViewingPublicKey = new Fr(34);
      const masterOutgoingViewingPublicKey = new Fr(56);
      const masterTaggingPublicKey = new Fr(78);

      const publicKeysHash = poseidon2Hash([
        masterNullifierPublicKey,
        masterIncomingViewingPublicKey,
        masterOutgoingViewingPublicKey,
        masterTaggingPublicKey,
        GeneratorIndex.PUBLIC_KEYS_HASH,
      ]);

      // We hash the partial address and the public keys hash to get the account address
      // TODO(#5726): Should GeneratorIndex.CONTRACT_ADDRESS be removed given that we introduced CONTRACT_ADDRESS_V1?
      // TODO(#5726): Move the following line to AztecAddress class?
      accountAddedToRegistry = poseidon2Hash([partialAddress, publicKeysHash, GeneratorIndex.CONTRACT_ADDRESS_V1]);

      await keyRegistry
        .withWallet(wallet)
        .methods.register(
          AztecAddress.fromField(accountAddedToRegistry),
          partialAddress,
          masterNullifierPublicKey,
          masterIncomingViewingPublicKey,
          masterOutgoingViewingPublicKey,
          masterTaggingPublicKey,
          masterNullifierPublicKey,
        )
        .send()
        .wait();
    });

    it('checks our registry contract from state vars contract and fails because the address has not been registered yet', async () => {
      const { txHash } = await stateVarsContract.methods
        .test_shared_mutable_private_getter_for_registry_contract(keyRegistry.address, 1, accountAddedToRegistry)
        .send()
        .wait();

      const rawLogs = await pxe.getUnencryptedLogs({ txHash });
      expect(Fr.fromBuffer(rawLogs.logs[0].log.data)).toEqual(Fr.ZERO);
    });

    it('checks our registry contract from state vars contract and finds the address and associated nullifier public key after a delay', async () => {
      await delay(5);

      const { txHash } = await stateVarsContract.methods
        .test_shared_mutable_private_getter_for_registry_contract(keyRegistry.address, 1, accountAddedToRegistry)
        .send()
        .wait();

      const rawLogs = await pxe.getUnencryptedLogs({ txHash });

      expect(Fr.fromBuffer(rawLogs.logs[0].log.data)).toEqual(new Fr(12));
    });

    it('we rotate the nullifier key', async () => {
      const partialAddress = new Fr(69);

      // This changes
      const oldMasterNullifierPublicKey = new Fr(12);
      const newMasterNullifierPublicKey = new Fr(910);
      const masterIncomingViewingPublicKey = new Fr(34);
      const masterOutgoingViewingPublicKey = new Fr(56);
      const masterTaggingPublicKey = new Fr(78);

      const publicKeysHash = poseidon2Hash([
        oldMasterNullifierPublicKey,
        masterIncomingViewingPublicKey,
        masterOutgoingViewingPublicKey,
        masterTaggingPublicKey,
        GeneratorIndex.PUBLIC_KEYS_HASH,
      ]);

      // We hash the partial address and the public keys hash to get the account address
      // TODO(#5726): Should GeneratorIndex.CONTRACT_ADDRESS be removed given that we introduced CONTRACT_ADDRESS_V1?
      // TODO(#5726): Move the following line to AztecAddress class?
      accountAddedToRegistry = poseidon2Hash([partialAddress, publicKeysHash, GeneratorIndex.CONTRACT_ADDRESS_V1]);

      await keyRegistry
        .withWallet(wallet)
        .methods.register(
          AztecAddress.fromField(accountAddedToRegistry),
          partialAddress,
          oldMasterNullifierPublicKey,
          masterIncomingViewingPublicKey,
          masterOutgoingViewingPublicKey,
          masterTaggingPublicKey,
          newMasterNullifierPublicKey,
        )
        .send()
        .wait();
    });

    it("checks our registry contract from state vars contract and finds our old public key because the key rotation  hasn't been applied yet", async () => {
      const { txHash } = await stateVarsContract.methods
        .test_shared_mutable_private_getter_for_registry_contract(keyRegistry.address, 1, accountAddedToRegistry)
        .send()
        .wait();

      const rawLogs = await pxe.getUnencryptedLogs({ txHash });
      expect(Fr.fromBuffer(rawLogs.logs[0].log.data)).toEqual(new Fr(12));
    });

    it('checks our registry contract from state vars contract and finds the new nullifier public key that has been rotated', async () => {
      await delay(5);

      const { txHash } = await stateVarsContract.methods
        .test_shared_mutable_private_getter_for_registry_contract(keyRegistry.address, 1, accountAddedToRegistry)
        .send()
        .wait();

      const rawLogs = await pxe.getUnencryptedLogs({ txHash });

      expect(Fr.fromBuffer(rawLogs.logs[0].log.data)).toEqual(new Fr(910));
    });
  });
});
