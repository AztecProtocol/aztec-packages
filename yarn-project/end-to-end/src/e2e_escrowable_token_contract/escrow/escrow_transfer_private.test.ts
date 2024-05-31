import { createAccounts } from '@aztec/accounts/testing';
import { type AccountWallet, AztecAddress, Fr, retryUntil } from '@aztec/aztec.js';
import { EscrowableTokenContract, SimpleEscrowContract } from '@aztec/noir-contracts.js';

import { setupPXEService } from '../../fixtures/utils.js';
import { EscrowTokenContractTest, toAddressOption } from '../escrowable_token_contract_test.js';

describe('e2e_escrowable_token_contract escrow transfer private', () => {
  const walletGroup2: AccountWallet[] = [];
  let teardownB: () => Promise<void>;

  const escrowContracts: SimpleEscrowContract[] = [];

  const t = new EscrowTokenContractTest('transfer_private');
  let { asset, accounts, tokenSim, wallets, aztecNode } = t;

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
    ({ asset, accounts, tokenSim, wallets, aztecNode } = t);

    // We need a fresh PXE service for the second group of wallets
    const { pxe: pxeB, teardown: _teardown } = await setupPXEService(aztecNode!, {}, undefined, true);
    teardownB = _teardown;
    const freshAccounts = await createAccounts(pxeB, 1);
    walletGroup2.push(freshAccounts[0]);

    await wallets[0].registerRecipient(walletGroup2[0].getCompleteAddress());
    await walletGroup2[0].registerRecipient(wallets[0].getCompleteAddress());

    await pxeB.registerContract({
      artifact: EscrowableTokenContract.artifact,
      instance: asset.instance,
    });

    tokenSim.addAccount(walletGroup2[0].getAddress());
    tokenSim.setLookupProvider(walletGroup2[0].getAddress(), walletGroup2[0]);

    // Need to deploy the contract
    const a = await SimpleEscrowContract.deploy(wallets[0], asset.address, wallets[0].getAddress()).send().deployed();

    escrowContracts.push(a);
    tokenSim.addAccount(a.address);

    const b = await SimpleEscrowContract.deploy(walletGroup2[0], asset.address, walletGroup2[0].getAddress())
      .send()
      .deployed();
    escrowContracts.push(b);
    tokenSim.addAccount(b.address);
    tokenSim.setLookupProvider(b.address, walletGroup2[0]);
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
      it('donate to escrow, `incoming_viewer_and_nullifier != to`', async () => {
        const amount = 100n;
        const nonce = Fr.random();

        expect(wallets[0].getAddress()).toEqual(accounts[0].address);

        const action = asset
          .withWallet(wallets[0])
          .methods.transfer(
            accounts[0].address,
            escrowContracts[0].address,
            amount,
            nonce,
            toAddressOption(accounts[0].address),
            toAddressOption(wallets[0].getAddress()),
            toAddressOption(accounts[0].address),
          );
        await wallets[0].createAuthWit({ caller: escrowContracts[0].address, action });

        await escrowContracts[0].withWallet(wallets[0]).methods.donate(amount, nonce).send().wait();
        tokenSim.transferPrivate(accounts[0].address, escrowContracts[0].address, amount);
      });

      it('withdraw from escrow', async () => {
        const amount = 5n;
        await escrowContracts[0].methods.transfer(accounts[0].address, amount, toAddressOption()).send().wait();
        tokenSim.transferPrivate(escrowContracts[0].address, accounts[0].address, amount);
      });

      describe('failure cases', () => {
        it('FAIL: direct transfer to vault fails', async () => {
          const amount = 10n;
          await expect(
            asset.methods
              .transfer(
                accounts[0].address,
                escrowContracts[0].address,
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

        await escrowContracts[0]
          .withWallet(wallets[0])
          .methods.transfer(escrowContracts[1].address, amount, toAddressOption(walletGroup2[0].getAddress()))
          .send()
          .wait();
        tokenSim.transferPrivate(escrowContracts[0].address, escrowContracts[1].address, amount);
      });

      it('transfer from escrow b to owner b', async () => {
        const amount = 7n;

        await escrowContracts[1]
          .withWallet(walletGroup2[0])
          .methods.transfer(walletGroup2[0].getAddress(), amount, toAddressOption())
          .send()
          .wait();
        tokenSim.transferPrivate(escrowContracts[1].address, walletGroup2[0].getAddress(), amount);
      });

      describe('failure cases', () => {
        it('FAIL: transfer from escrow to escrow (unspecified incoming_viewer_and_nullifier)', async () => {
          const amount = 9n;

          await expect(
            escrowContracts[0]
              .withWallet(wallets[0])
              .methods.transfer(escrowContracts[1].address, amount, toAddressOption())
              .simulate(),
          ).rejects.toThrow();
        });
      });
    });

    it('sending funds but using recipient as escrow, 🏦🤫💰', async () => {
      // For this test, I'm doing something quite strange, I am sending funds to Bob, but I am not allowing him to actually spend them
      // I am still the "incoming_viewer_and_nullifier". This is a really annoying example as it will look like loss of funds to the users, and to get the funds
      // back, or spend them, I need to give Bob some secrets 💀

      await awaitUserSynchronized(wallets[0], accounts[0].address);
      await awaitUserSynchronized(walletGroup2[0], walletGroup2[0].getAddress());

      const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods
        .transfer(
          accounts[0].address,
          walletGroup2[0].getAddress(),
          amount,
          0,
          toAddressOption(accounts[0].address), // I'm setting myself af the change_incoming_viewer_and_nullifier
          toAddressOption(accounts[0].address), // I'm setting myself af the to_incoming_viewer_and_nullifier
          toAddressOption(accounts[0].address), // I'm setting myself as the outgoing_viewer
        )
        .send()
        .wait();

      // NOTICE! From the POV of walletGroup2[0], it have not received any funds!
      // Since Alice still sent some funds, this should be accounted similar to a transfer to 0
      tokenSim.transferPrivate(accounts[0].address, AztecAddress.ZERO, amount);
      // In practice, the funds are still possible to rescue, but this makes our account a bit simpler.

      {
        const balance1 = await asset.methods.balance_of_private(accounts[1].address).simulate();
        await expect(
          asset
            .withWallet(walletGroup2[0])
            .methods.transfer(
              walletGroup2[0].getAddress(),
              accounts[0].address,
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
