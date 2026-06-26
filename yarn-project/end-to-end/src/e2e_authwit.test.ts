import { AztecAddress } from '@aztec/aztec.js/addresses';
import { computeInnerAuthWitHash } from '@aztec/aztec.js/authorization';
import { Fr } from '@aztec/aztec.js/fields';
import { AuthRegistryContract } from '@aztec/noir-contracts.js/AuthRegistry';
import { AuthWitTestContract } from '@aztec/noir-test-contracts.js/AuthWitTest';
import { GenericProxyContract } from '@aztec/noir-test-contracts.js/GenericProxy';
import { STANDARD_AUTH_REGISTRY_ADDRESS } from '@aztec/standard-contracts/auth-registry';

import { jest } from '@jest/globals';

import { sendThroughAuthwitProxy } from './fixtures/authwit_proxy.js';
import { AUTOMINE_E2E_OPTS, DUPLICATE_NULLIFIER_ERROR } from './fixtures/fixtures.js';
import { type EndToEndContext, ensureAuthRegistryPublished, setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';

const TIMEOUT = 300_000;

// Tests the authorization witness (authwit) system in both private and public contexts.
// Uses setup(2, AUTOMINE_E2E_OPTS) providing one node with automine sequencer and two accounts.
// Accounts are publicly deployed and the AuthRegistry is published before any test runs.
describe('e2e_authwit_tests', () => {
  jest.setTimeout(TIMEOUT);

  let wallet: TestWallet;
  let account1Address: AztecAddress;
  let account2Address: AztecAddress;
  let teardown: EndToEndContext['teardown'];

  let auth: AuthWitTestContract;
  let authwitProxy: GenericProxyContract;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [account1Address, account2Address],
    } = await setup(2, { ...AUTOMINE_E2E_OPTS }));
    await ensureAuthRegistryPublished(wallet, account1Address);

    ({ contract: auth } = await AuthWitTestContract.deploy(wallet).send({ from: account1Address }));
    ({ contract: authwitProxy } = await GenericProxyContract.deploy(wallet).send({ from: account1Address }));
  });

  afterAll(() => teardown());

  // Private authwit tests: witnesses are provided only to PXE, not published on-chain.
  describe('Private', () => {
    // Tests inner-hash consumption via the AuthWitTest proxy flow.
    describe('arbitrary data', () => {
      // Creates an inner hash, generates a private witness, asserts it is valid only for account1,
      // consumes it via the proxy (making the inner hash a nullifier), then asserts double-spend is rejected.
      it('happy path', async () => {
        // What are we doing here:
        // 1. We compute an inner hash which is here just a hash of random data
        // 2. We then compute the message hash, which is binding it to a "consumer" (here the "auth" contract)
        // 3. We then create an authwit for this message hash.
        // 4. We check that the authwit is valid in private for wallet[0] (check that it is signed by 0)
        // 5. We check that the authwit is NOT valid in private for wallet[1] (check that it is not signed by 1)

        const innerHash = await computeInnerAuthWitHash([Fr.fromHexString('0xdead')]);

        const intent = { consumer: auth.address, innerHash };
        const witness = await wallet.createAuthWit(account1Address, intent);

        // Check that the authwit is valid in private for account1
        expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
          isValidInPrivate: true,
          isValidInPublic: false,
        });

        // Check that the authwit is NOT valid in private for account2
        expect(await wallet.lookupValidity(account2Address, intent, witness)).toEqual({
          isValidInPrivate: false,
          isValidInPublic: false,
        });

        // Consume the inner hash using the account1 as the "on behalf of".
        // We send through the proxy so the proxy becomes msg_sender in consume,
        // while account1 remains the tx sender (with their keys in scope).
        const action = auth.methods.consume(account1Address, innerHash);
        await sendThroughAuthwitProxy(authwitProxy, action, { from: account1Address, authWitnesses: [witness] });

        expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
          isValidInPrivate: false,
          isValidInPublic: false,
        });

        // Try to consume the same authwit again, it should fail
        await expect(
          sendThroughAuthwitProxy(authwitProxy, auth.methods.consume(account1Address, innerHash), {
            from: account1Address,
            authWitnesses: [witness],
          }),
        ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
      });
    });
  });

  // Public authwit tests: witnesses are stored on-chain via setPublicAuthWit and consumed through
  // the AuthRegistry contract.
  describe('Public', () => {
    // Tests that a public authwit can be set, validated, consumed, and then appears invalid.
    describe('arbitrary data', () => {
      // Sets a public authwit for account1, validates it is both private and public valid,
      // then consumes it via the AuthRegistry and verifies it is no longer publicly valid.
      it('happy path', async () => {
        const innerHash = await computeInnerAuthWitHash([Fr.fromHexString('0xdead'), Fr.fromHexString('0x01')]);

        const intent = { consumer: account2Address, innerHash };

        const witness = await wallet.createAuthWit(account1Address, intent);

        expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
          isValidInPrivate: true,
          isValidInPublic: false,
        });

        const validateActionInteraction = await wallet.setPublicAuthWit(account1Address, intent, true);
        await validateActionInteraction.send();
        expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
          isValidInPrivate: true,
          isValidInPublic: true,
        });

        const registry = AuthRegistryContract.at(STANDARD_AUTH_REGISTRY_ADDRESS, wallet);
        await registry.methods.consume(account1Address, innerHash).send({ from: account2Address });

        expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
          isValidInPrivate: true,
          isValidInPublic: false,
        });
      });

      // Tests that a public authwit can be cancelled (set to false) before consumption.
      describe('failure case', () => {
        // Sets a public authwit, then immediately revokes it, then attempts to consume — expects
        // an "unauthorized" revert.
        it('cancel before usage', async () => {
          const innerHash = await computeInnerAuthWitHash([Fr.fromHexString('0xdead'), Fr.fromHexString('0x02')]);
          const intent = { consumer: auth.address, innerHash };

          const witness = await wallet.createAuthWit(account1Address, intent);

          expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
            isValidInPrivate: true,
            isValidInPublic: false,
          });

          const validateActionInteraction = await wallet.setPublicAuthWit(account1Address, intent, true);
          await validateActionInteraction.send();

          expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
            isValidInPrivate: true,
            isValidInPublic: true,
          });

          const cancelActionInteraction = await wallet.setPublicAuthWit(account1Address, intent, false);
          await cancelActionInteraction.send();

          expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
            isValidInPrivate: true,
            isValidInPublic: false,
          });

          const registry = AuthRegistryContract.at(STANDARD_AUTH_REGISTRY_ADDRESS, wallet);
          await expect(
            registry.methods.consume(account1Address, innerHash).simulate({ from: account2Address }),
          ).rejects.toThrow(/unauthorized/);
        });
      });
    });
  });
});
