import { AztecAddress } from '@aztec/aztec.js/addresses';
import { computeInnerAuthWitHash } from '@aztec/aztec.js/authorization';
import { Fr } from '@aztec/aztec.js/fields';
import { AuthRegistryContract } from '@aztec/noir-contracts.js/AuthRegistry';
import { AuthWitTestContract } from '@aztec/noir-test-contracts.js/AuthWitTest';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { jest } from '@jest/globals';

import { DUPLICATE_NULLIFIER_ERROR } from './fixtures/fixtures.js';
import { ensureAccountContractsPublished, setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';

const TIMEOUT = 150_000;

describe('e2e_authwit_tests', () => {
  jest.setTimeout(TIMEOUT);

  let wallet: TestWallet;
  let account1Address: AztecAddress;
  let account2Address: AztecAddress;

  let auth: AuthWitTestContract;

  beforeAll(async () => {
    ({
      wallet,
      accounts: [account1Address, account2Address],
    } = await setup(2));
    await ensureAccountContractsPublished(wallet, [account1Address, account2Address]);

    auth = await AuthWitTestContract.deploy(wallet).send({ from: account1Address });
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
        await auth.methods
          .consume(account1Address, innerHash)
          .send({ from: account2Address, authWitnesses: [witness] });

        expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
          isValidInPrivate: false,
          isValidInPublic: false,
        });

        // Try to consume the same authwit again, it should fail
        await expect(
          auth.methods.consume(account1Address, innerHash).send({ from: account2Address, authWitnesses: [witness] }),
        ).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
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

        const validateActionInteraction = await wallet.setPublicAuthWit(account1Address, intent, true);
        await validateActionInteraction.send();
        expect(await wallet.lookupValidity(account1Address, intent, witness)).toEqual({
          isValidInPrivate: true,
          isValidInPublic: true,
        });

        const registry = AuthRegistryContract.at(ProtocolContractAddress.AuthRegistry, wallet);
        await registry.methods.consume(account1Address, innerHash).send({ from: account2Address });

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

          const registry = AuthRegistryContract.at(ProtocolContractAddress.AuthRegistry, wallet);
          await expect(
            registry.methods.consume(account1Address, innerHash).simulate({ from: account2Address }),
          ).rejects.toThrow(/unauthorized/);
        });
      });
    });
  });
});
