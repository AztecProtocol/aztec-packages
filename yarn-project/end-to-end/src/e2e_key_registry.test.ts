import { type AccountWallet, AztecAddress, Fr, type PXE } from '@aztec/aztec.js';
import { CompleteAddress, GeneratorIndex, type PartialAddress, Point, deriveKeys } from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { KeyRegistryContract, TestContract } from '@aztec/noir-contracts.js';
import { getCanonicalKeyRegistryAddress } from '@aztec/protocol-contracts/key-registry';

import { jest } from '@jest/globals';

import { publicDeployAccounts, setup } from './fixtures/utils.js';

const TIMEOUT = 100_000;

describe('Key Registry', () => {
  let keyRegistry: KeyRegistryContract;

  let pxe: PXE;
  let testContract: TestContract;
  jest.setTimeout(TIMEOUT);

  let wallets: AccountWallet[];

  let teardown: () => Promise<void>;

  // TODO(#5834): use AztecAddress.compute or smt
  const {
    masterNullifierPublicKey,
    masterIncomingViewingPublicKey,
    masterOutgoingViewingPublicKey,
    masterTaggingPublicKey,
    publicKeysHash,
  } = deriveKeys(Fr.random());
  const partialAddress: PartialAddress = Fr.random();
  let account: AztecAddress;

  beforeAll(async () => {
    ({ teardown, pxe, wallets } = await setup(3));
    keyRegistry = await KeyRegistryContract.at(getCanonicalKeyRegistryAddress(), wallets[0]);

    testContract = await TestContract.deploy(wallets[0]).send().deployed();

    await publicDeployAccounts(wallets[0], wallets.slice(0, 2));

    // TODO(#5834): use AztecAddress.compute or smt
    account = AztecAddress.fromField(
      poseidon2Hash([publicKeysHash, partialAddress, GeneratorIndex.CONTRACT_ADDRESS_V1]),
    );
  });

  const delay = async (blocks: number) => {
    for (let i = 0; i < blocks; i++) {
      await testContract.methods.delay().send().wait();
    }
  };

  afterAll(() => teardown());

  describe('failure cases', () => {
    it('throws when address preimage check fails', async () => {
      const keys = [
        masterNullifierPublicKey,
        masterIncomingViewingPublicKey,
        masterOutgoingViewingPublicKey,
        masterTaggingPublicKey,
      ];

      // we randomly invalidate some of the keys
      keys[Math.floor(Math.random() * keys.length)] = Point.random();

      await expect(
        keyRegistry
          .withWallet(wallets[0])
          .methods.register(AztecAddress.fromField(account), partialAddress, keys[0], keys[1], keys[2], keys[3])
          .send()
          .wait(),
      ).rejects.toThrow('Computed address does not match supplied address');
    });

    describe('should fail when rotating keys with different types of bad input', () => {
      it('should fail when we try to rotate keys, while setting a 0 key', async () => {
        await expect(
          keyRegistry
            .withWallet(wallets[0])
            .methods.rotate_nullifier_public_key(wallets[0].getAddress(), Point.ZERO, Fr.ZERO)
            .send()
            .wait(),
        ).rejects.toThrow('New nullifier public key must be non-zero');
      });

      it('should fail when we try to rotate keys for another address without authwit', async () => {
        await expect(
          keyRegistry
            .withWallet(wallets[0])
            .methods.rotate_nullifier_public_key(wallets[1].getAddress(), Point.random(), Fr.ZERO)
            .send()
            .wait(),
        ).rejects.toThrow('Assertion failed: Message not authorized by account');
      });
    });
  });

  describe('key registration flow', () => {
    it('registers', async () => {
      await keyRegistry
        .withWallet(wallets[0])
        .methods.register(
          AztecAddress.fromField(account),
          partialAddress,
          masterNullifierPublicKey,
          masterIncomingViewingPublicKey,
          masterOutgoingViewingPublicKey,
          masterTaggingPublicKey,
        )
        .send()
        .wait();

      // We check if our registered nullifier key is equal to the key obtained from the getter by
      // reading our registry contract from the test contract. We expect this to fail because the change has not been applied yet
      const emptyNullifierPublicKey = await testContract.methods
        .test_shared_mutable_private_getter_for_registry_contract(1, account)
        .simulate();

      expect(new Fr(emptyNullifierPublicKey)).toEqual(Fr.ZERO);

      // We check it again after a delay and expect that the change has been applied and consequently the assert is true
      await delay(5);

      const nullifierPublicKey = await testContract.methods
        .test_shared_mutable_private_getter_for_registry_contract(1, account)
        .simulate();

      expect(new Fr(nullifierPublicKey)).toEqual(poseidon2Hash(masterNullifierPublicKey.toFields()));
    });
  });

  describe('key rotation flows', () => {
    const firstNewMasterNullifierPublicKey = Point.random();
    it('rotates npk_m', async () => {
      await keyRegistry
        .withWallet(wallets[0])
        .methods.rotate_nullifier_public_key(wallets[0].getAddress(), firstNewMasterNullifierPublicKey, Fr.ZERO)
        .send()
        .wait();

      // We check if our rotated nullifier key is equal to the key obtained from the getter by
      // reading our registry contract from the test contract. We expect this to fail because the change has not been applied yet
      const emptyNullifierPublicKey = await testContract.methods
        .test_shared_mutable_private_getter_for_registry_contract(1, wallets[0].getAddress())
        .simulate();

      expect(new Fr(emptyNullifierPublicKey)).toEqual(Fr.ZERO);

      // We check it again after a delay and expect that the change has been applied and consequently the assert is true
      await delay(5);

      const nullifierPublicKey = await testContract.methods
        .test_shared_mutable_private_getter_for_registry_contract(1, wallets[0].getAddress())
        .simulate();

      expect(new Fr(nullifierPublicKey)).toEqual(poseidon2Hash(firstNewMasterNullifierPublicKey.toFields()));
    });

    it(`rotates npk_m with authwit`, async () => {
      const secondNewMasterNullifierPublicKey = Point.random();
      const action = keyRegistry
        .withWallet(wallets[1])
        .methods.rotate_nullifier_public_key(wallets[0].getAddress(), secondNewMasterNullifierPublicKey, Fr.ZERO);

      await wallets[0]
        .setPublicAuthWit({ caller: wallets[1].getCompleteAddress().address, action }, true)
        .send()
        .wait();

      await action.send().wait();

      // We check if our rotated nullifier key is equal to the key obtained from the getter by
      // reading our registry contract from the test contract. We expect this value to be the old one, because the new one hasn't been applied
      const oldNullifierPublicKey = await testContract.methods
        .test_shared_mutable_private_getter_for_registry_contract(1, wallets[0].getAddress())
        .simulate();

      expect(new Fr(oldNullifierPublicKey)).toEqual(poseidon2Hash(firstNewMasterNullifierPublicKey.toFields()));

      // We check it again after a delay and expect that the change has been applied and consequently the assert is true
      await delay(5);

      const newNullifierPublicKey = await testContract.methods
        .test_shared_mutable_private_getter_for_registry_contract(1, wallets[0].getAddress())
        .simulate();

      expect(new Fr(newNullifierPublicKey)).toEqual(poseidon2Hash(secondNewMasterNullifierPublicKey.toFields()));
    });
  });

  describe('key freshness lib', () => {
    it('succeeds for non-registered account available in PXE', async () => {
      // TODO(#5834): Make this not disgusting
      const newAccountKeys = deriveKeys(Fr.random());
      const newAccountPartialAddress = Fr.random();
      const newAccount = AztecAddress.fromField(
        poseidon2Hash([newAccountKeys.publicKeysHash, newAccountPartialAddress, GeneratorIndex.CONTRACT_ADDRESS_V1]),
      );
      const newAccountCompleteAddress = CompleteAddress.create(
        newAccount,
        newAccountKeys.masterIncomingViewingPublicKey,
        newAccountPartialAddress,
      );

      // Should fail as the contract is not registered in key registry nor registered in PXE as a recipient
      await expect(
        testContract.methods
          .test_nullifier_key_freshness(newAccount, newAccountKeys.masterNullifierPublicKey)
          .send()
          .wait(),
      ).rejects.toThrow(`Cannot satisfy constraint 'computed_address.eq(address)'`);

      await pxe.registerRecipient(newAccountCompleteAddress, [
        newAccountKeys.masterNullifierPublicKey,
        newAccountKeys.masterIncomingViewingPublicKey,
        newAccountKeys.masterOutgoingViewingPublicKey,
        newAccountKeys.masterTaggingPublicKey,
      ]);

      // Should succeed as the account is now registered as a recipient in PXE
      await testContract.methods
        .test_nullifier_key_freshness(newAccount, newAccountKeys.masterNullifierPublicKey)
        .send()
        .wait();
    });

    // TODO(benesjan): re-enable this test
    it.skip('gets new key after rotation', async () => {
      const newMasterNullifierPublicKey = Point.random();
      // Rotate the key
      await keyRegistry
        .withWallet(wallets[0])
        .methods.rotate_nullifier_public_key(wallets[0].getAddress(), newMasterNullifierPublicKey, Fr.ZERO)
        .send()
        .wait();

      // Fails as the rotation has not yet been applied
      await expect(
        testContract.methods
          .test_nullifier_key_freshness(wallets[0].getAddress(), newMasterNullifierPublicKey)
          .send()
          .wait(),
      ).rejects.toThrow(
        `Cannot satisfy constraint 'assert_eq(get_fresh_nullifier_public_key_hash(&mut context, address), poseidon2_hash(public_nullifying_key.serialize()))'`,
      );

      await delay(5);

      // Change has been applied hence should succeed now
      await testContract.methods
        .test_nullifier_key_freshness(wallets[0].getAddress(), newMasterNullifierPublicKey)
        .send()
        .wait();
    });
  });
});
