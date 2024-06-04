import { createAccounts } from '@aztec/accounts/testing';
import { type AccountWallet, AztecAddress, Contract, Fr, retryUntil } from '@aztec/aztec.js';
import { EntrypointPayload } from '@aztec/aztec.js/entrypoint';
import {
  EscrowableTokenContract,
  SchnorrAccountContractArtifact,
  SimpleEscrowContract,
} from '@aztec/noir-contracts.js';

import { setupPXEService } from '../../fixtures/utils.js';
import { EscrowTokenContractTest, toAddressOption } from '../escrowable_token_contract_test.js';

describe('e2e_escrowable_token_contract escrow transfer private', () => {
  let teardownB: () => Promise<void>;

  const t = new EscrowTokenContractTest('transfer_private');
  let { asset, tokenSim, wallets, aztecNode } = t;

  let alice!: AccountWallet; // On pxe a
  let bob!: AccountWallet; // On pxe b

  let escrowAlice!: SimpleEscrowContract;
  let escrowBob!: SimpleEscrowContract;

  const awaitUserSynchronized = async (wallet: AccountWallet, owner: AztecAddress) => {
    const isUserSynchronized = async () => {
      return await wallet.isAccountStateSynchronized(owner);
    };
    await retryUntil(isUserSynchronized, `synch of user ${owner.toString()}`, 10);
  };

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    ({ asset, tokenSim, wallets, aztecNode } = t);

    // We need a fresh PXE service for the second group of wallets
    const { pxe: pxeB, teardown: _teardown } = await setupPXEService(aztecNode!, {}, undefined, true);
    teardownB = _teardown;

    alice = wallets[0];
    bob = (await createAccounts(pxeB, 1))[0];

    await alice.registerRecipient(bob.getCompleteAddress());
    await bob.registerRecipient(alice.getCompleteAddress());

    await bob.registerContract({
      artifact: EscrowableTokenContract.artifact,
      instance: asset.instance,
    });

    // Deploys escrows for alice and bob
    escrowAlice = await SimpleEscrowContract.deploy(alice, asset.address, alice.getAddress()).send().deployed();
    escrowBob = await SimpleEscrowContract.deploy(bob, asset.address, bob.getAddress()).send().deployed();

    // Add to the token
    tokenSim.addAccount(escrowAlice.address);
    tokenSim.addAccount(escrowBob.address);
    tokenSim.addAccount(bob.getAddress());
    tokenSim.setWallet(bob.getAddress(), bob);
    tokenSim.setWallet(escrowBob.address, bob);
  });

  afterAll(async () => {
    await t.teardown();
    await teardownB();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  describe('escrowing', () => {
    describe('simple escrow', () => {
      it('alice donate to alice escrow, `incoming_viewer_and_nullifier != to`', async () => {
        const amount = 100n;
        const nonce = Fr.random();

        // Create an action that we can approve with an authwit and then execute
        const action = asset
          .withWallet(alice)
          .methods.transfer(
            alice.getAddress(),
            escrowAlice.address,
            amount,
            nonce,
            toAddressOption(alice.getAddress()),
            toAddressOption(alice.getAddress()),
            toAddressOption(alice.getAddress()),
          );
        await alice.createAuthWit({ caller: escrowAlice.address, action });

        // We then donate (consuming the authwit) and which increases our balance
        await escrowAlice.withWallet(alice).methods.donate(amount, nonce).send().wait();
        tokenSim.transferPrivate(alice.getAddress(), escrowAlice.address, amount);
      });

      it('withdraw from escrow', async () => {
        const amount = 5n;
        await escrowAlice.methods.transfer(alice.getAddress(), amount, toAddressOption()).send().wait();
        tokenSim.transferPrivate(escrowAlice.address, alice.getAddress(), amount);
      });

      describe('failure cases', () => {
        it('FAIL: direct transfer to vault fails', async () => {
          // This test should fail because the escrow does not have any keys registered and hence obtaining them fails.
          const amount = 10n;
          await expect(
            asset.methods
              .transfer(
                alice.getAddress(),
                escrowAlice.address,
                amount,
                0,
                toAddressOption(),
                toAddressOption(),
                toAddressOption(),
              )
              .simulate(),
          ).rejects.toThrow();
        });
      });
    });

    describe('escrow to escrow', () => {
      /**
       * Interactions between 2 escrow contracts. To test cases where we have some `change` vault that need to be emitted somewhere
       * different than the `from`, but at the same time different than the to, and the `to_incoming_viewer_and_nullifier`.
       */

      it('transfer from escrow a to escrow b', async () => {
        const amount = 7n;

        await escrowAlice
          .withWallet(alice)
          .methods.transfer(escrowBob.address, amount, toAddressOption(bob.getAddress()))
          .send()
          .wait();
        tokenSim.transferPrivate(escrowAlice.address, escrowBob.address, amount);
      });

      it('transfer from escrow b to owner b', async () => {
        const amount = 7n;

        await escrowBob.withWallet(bob).methods.transfer(bob.getAddress(), amount, toAddressOption()).send().wait();
        tokenSim.transferPrivate(escrowBob.address, bob.getAddress(), amount);
      });

      describe('failure cases', () => {
        it('FAIL: transfer from escrow to escrow (unspecified incoming_viewer_and_nullifier)', async () => {
          // This test should fail because we try to fetch keys for escrow 1 when `the incoming_viewer_and_nullifier` is not specified and escrows do not have keys registered.
          const amount = 9n;

          await expect(
            escrowAlice.withWallet(alice).methods.transfer(escrowBob.address, amount, toAddressOption()).simulate(),
          ).rejects.toThrow();
        });
      });
    });

    it('Alice blackmails Bob. She transfer funds to him, but is using herself as viewers and nullifier', async () => {
      // For this test, we are doing something quite strange.
      // Alice is sending funds to Bob, but setting herself as the `to_incoming_viewer_and_nullifier`
      // This means that Bob will not be used when encrypting the message, e.g., he will not learn that he received something,
      // nor be able to compute the nullifier.
      // In practice this means that Bob will not be able to spend the notes on his own, and neither will Alice.
      //
      // However, their aggregate knowledge should allow them to spend the notes. Like a really weird multi-sig

      await awaitUserSynchronized(alice, alice.getAddress());
      await awaitUserSynchronized(bob, bob.getAddress());

      const balance0 = await asset.methods.balance_of_private(alice.getAddress()).simulate();
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods
        .transfer(
          alice.getAddress(),
          bob.getAddress(),
          amount,
          0,
          toAddressOption(alice.getAddress()), // Alice is used as `change_incoming_viewer_and_nullifier`
          toAddressOption(alice.getAddress()), // Alice is used as `to_incoming_viewer_and_nullifier`
          toAddressOption(alice.getAddress()), // Alice is used as `outgoing_viewer`
        )
        .send()
        .wait();

      // NOTICE! From the POV of bob, it have not received any funds!
      // Since Alice still sent some funds, this should be accounted similar to a transfer to 0
      tokenSim.transferPrivate(alice.getAddress(), AztecAddress.ZERO, amount);
      // In practice, the funds are still possible to rescue, but this makes our account a bit simpler.
      {
        // Now we try to obtain the balance. It should fail with zero notes error because the recipient's PXE is expected to not have decrypted any notes.
        const balance1 = await asset.methods.balance_of_private(bob.getAddress()).simulate();
        await expect(
          asset
            .withWallet(bob)
            .methods.transfer(
              bob.getAddress(),
              alice.getAddress(),
              balance1,
              0,
              toAddressOption(),
              toAddressOption(),
              toAddressOption(),
            )
            .simulate(),
        ).rejects.toThrow("Assertion failed: Cannot return zero notes 'num_notes != 0'");
      }
    });
  });
});
