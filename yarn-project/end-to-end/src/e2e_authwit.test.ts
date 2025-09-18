import { AztecAddress, Fr, computeAuthWitMessageHash, computeInnerAuthWitHash } from '@aztec/aztec.js';
import { AuthRegistryContract } from '@aztec/noir-contracts.js/AuthRegistry';
import { AuthWitTestContract } from '@aztec/noir-test-contracts.js/AuthWitTest';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { TestWallet } from '@aztec/test-wallet';

import { jest } from '@jest/globals';

import { DUPLICATE_NULLIFIER_ERROR } from './fixtures/fixtures.js';
import { ensureAccountContractsPublished, setup } from './fixtures/utils.js';

const TIMEOUT = 150_000;

describe('e2e_authwit_tests', () => {
  jest.setTimeout(TIMEOUT);

  let wallet: TestWallet;

  let account1Address: AztecAddress;
  let account2Address: AztecAddress;

  let chainId: Fr;
  let version: Fr;
  let auth: AuthWitTestContract;

  beforeAll(async () => {
    const { wallet: defaultWallet, accounts, pxe } = await setup(2);
    // docs:start:public_deploy_accounts
    [account1Address, account2Address] = accounts;
    wallet = defaultWallet as TestWallet;
    await ensureAccountContractsPublished(wallet, accounts.slice(0, 2));
    // docs:end:public_deploy_accounts

    const nodeInfo = await pxe.getNodeInfo();
    chainId = new Fr(nodeInfo.l1ChainId);
    version = new Fr(nodeInfo.rollupVersion);

    auth = await AuthWitTestContract.deploy(wallet).send({ from: account1Address }).deployed();
  });

  describe('Private', () => {
    describe('arbitrary data', () => {
      it('happy path', async () => {
        // What are we doing here:
        // 1. We compute an inner hash which is here just a hash of random data
        // 2. We then compute the message hash, which is binding it to a "consumer" (here the "auth" contract)
        // 3. We then create an authwit for this message hash.
        // 4. We check that the authwit is valid in private for wallet[0] (check that it is signed by 0)
        // 5. We check that the authwit is NOT valid in private for wallet[1] (check that it is not signed by 1)

        // docs:start:compute_inner_authwit_hash
        const innerHash = await computeInnerAuthWitHash([Fr.fromHexString('0xdead')]);
        // docs:end:compute_inner_authwit_hash
        // docs:start:compute_arbitrary_authwit_hash

        const intent = { consumer: auth.address, innerHash };
        // docs:end:compute_arbitrary_authwit_hash
        // docs:start:create_authwit
        const witness = await wallet.createAuthWit(account1Address, intent);
        // docs:end:create_authwit

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
        await auth.methods
          .consume(account1Address, innerHash)
          .send({ from: account2Address, authWitnesses: [witness] })
          .wait();

        expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
          isValidInPrivate: false,
          isValidInPublic: false,
        });

        // Try to consume the same authwit again, it should fail
        await expect(
          auth.methods
            .consume(account1Address, innerHash)
            .send({ from: account2Address, authWitnesses: [witness] })
            .wait(),
        ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
      });
      describe('failure case', () => {
        it('invalid chain id', async () => {
          const innerHash = await computeInnerAuthWitHash([Fr.fromHexString('0xdead'), Fr.fromHexString('0xbeef')]);
          const intent = { consumer: auth.address, innerHash };

          const messageHash = await computeAuthWitMessageHash(intent, { chainId: Fr.random(), version });
          const expectedMessageHash = await computeAuthWitMessageHash(intent, { chainId, version });

          const witness = await wallet.createAuthWit(account1Address, messageHash);

          // We should NOT see it as valid, even though we have the authwit, since the chain id is wrong
          expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
            isValidInPrivate: false,
            isValidInPublic: false,
          });

          // The transaction should be dropped because of the invalid chain id
          await expect(
            auth.methods.consume(account1Address, innerHash).simulate({ from: account2Address }),
          ).rejects.toThrow(`Unknown auth witness for message hash ${expectedMessageHash.toString()}`);
        });

        it('invalid version', async () => {
          const innerHash = await computeInnerAuthWitHash([Fr.fromHexString('0xdead'), Fr.fromHexString('0xbeef')]);
          const intent = { consumer: auth.address, innerHash };

          const messageHash = await computeAuthWitMessageHash(intent, { chainId, version: Fr.random() });

          const expectedMessageHash = await computeAuthWitMessageHash(intent, { chainId, version });

          const witness = await wallet.createAuthWit(account1Address, messageHash);

          // We should NOT see it as valid, even though we have the authwit, since the version is wrong
          expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
            isValidInPrivate: false,
            isValidInPublic: false,
          });

          // The transaction should be dropped because of the invalid version
          await expect(
            auth.methods.consume(account1Address, innerHash).simulate({ from: account2Address }),
          ).rejects.toThrow(`Unknown auth witness for message hash ${expectedMessageHash.toString()}`);

          expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
            isValidInPrivate: false,
            isValidInPublic: false,
          });
        });
      });
    });
  });

  describe('Public', () => {
    describe('arbitrary data', () => {
      it('happy path', async () => {
        const innerHash = await computeInnerAuthWitHash([Fr.fromHexString('0xdead'), Fr.fromHexString('0x01')]);

        const intent = { consumer: account2Address, innerHash };

        const witness = await wallet.createAuthWit(account1Address, intent);

        expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
          isValidInPrivate: true,
          isValidInPublic: false,
        });

        // docs:start:set_public_authwit
        const validateActionInteraction = await wallet.setPublicAuthWit(account1Address, intent, true);
        await validateActionInteraction.send().wait();
        // docs:end:set_public_authwit
        expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
          isValidInPrivate: true,
          isValidInPublic: true,
        });

        const registry = await AuthRegistryContract.at(ProtocolContractAddress.AuthRegistry, wallet);
        await registry.methods.consume(account1Address, innerHash).send({ from: account2Address }).wait();

        expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
          isValidInPrivate: true,
          isValidInPublic: false,
        });
      });

      describe('failure case', () => {
        it('cancel before usage', async () => {
          const innerHash = await computeInnerAuthWitHash([Fr.fromHexString('0xdead'), Fr.fromHexString('0x02')]);
          const intent = { consumer: auth.address, innerHash };

          const witness = await wallet.createAuthWit(account1Address, intent);

          expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
            isValidInPrivate: true,
            isValidInPublic: false,
          });

          const validateActionInteraction = await wallet.setPublicAuthWit(account1Address, intent, true);
          await validateActionInteraction.send().wait();

          expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
            isValidInPrivate: true,
            isValidInPublic: true,
          });

          const cancelActionInteraction = await wallet.setPublicAuthWit(account1Address, intent, false);
          await cancelActionInteraction.send({ from: account1Address }).wait();

          expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
            isValidInPrivate: true,
            isValidInPublic: false,
          });

          const registry = await AuthRegistryContract.at(ProtocolContractAddress.AuthRegistry, wallet);
          await expect(
            registry.methods.consume(account1Address, innerHash).simulate({ from: account2Address }),
          ).rejects.toThrow(/unauthorized/);
        });
      });
    });
  });
});
