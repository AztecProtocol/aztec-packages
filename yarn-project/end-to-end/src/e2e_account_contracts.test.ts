import { EcdsaKAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { SingleKeyAccountContract } from '@aztec/accounts/single_key';
import {
  type AccountContract,
  AccountManager,
  AccountWallet,
  FeeJuicePaymentMethod,
  Fr,
  GrumpkinScalar,
  type Logger,
  type PXE,
  type Wallet,
  getAccountContractAddress,
} from '@aztec/aztec.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import { setup } from './fixtures/utils.js';

const itShouldBehaveLikeAnAccountContract = (
  getAccountContract: (encryptionKey: GrumpkinScalar) => AccountContract,
) => {
  describe(`behaves like an account contract`, () => {
    let pxe: PXE;
    let logger: Logger;
    let teardown: () => Promise<void>;
    let wallet: Wallet;
    let child: ChildContract;

    beforeAll(async () => {
      const secret = Fr.random();
      const salt = Fr.random();
      const signingKey = deriveSigningKey(secret);
      const accountContract = getAccountContract(signingKey);
      const address = await getAccountContractAddress(accountContract, secret, salt);
      const accountData = {
        secret,
        signingKey,
        salt,
        address,
      };

      ({ logger, pxe, teardown, wallet } = await setup(0, { initialFundedAccounts: [accountData] }));

      const account = await AccountManager.create(pxe, secret, accountContract, salt);
      if (await account.hasInitializer()) {
        // The account is pre-funded and can pay for its own fee.
        const paymentMethod = new FeeJuicePaymentMethod(address);
        await account.deploy({ fee: { paymentMethod } }).wait();
      } else {
        await account.register();
      }

      wallet = await account.getWallet();
      child = await ChildContract.deploy(wallet).send().deployed();
    });

    afterAll(() => teardown());

    it('calls a private function', async () => {
      logger.info('Calling private function...');
      await child.methods.value(42).send().wait({ interval: 0.1 });
    });

    it('calls a public function', async () => {
      logger.info('Calling public function...');
      await child.methods.pub_inc_value(42).send().wait({ interval: 0.1 });
      const storedValue = await pxe.getPublicStorageAt(child.address, new Fr(1));
      expect(storedValue).toEqual(new Fr(42n));
    });

    it('fails to call a function using an invalid signature', async () => {
      const accountAddress = wallet.getCompleteAddress();
      const nodeInfo = await pxe.getNodeInfo();
      const randomContract = getAccountContract(GrumpkinScalar.random());
      const entrypoint = randomContract.getInterface(accountAddress, nodeInfo);
      const invalidWallet = new AccountWallet(pxe, entrypoint);
      const childWithInvalidWallet = await ChildContract.at(child.address, invalidWallet);
      await expect(childWithInvalidWallet.methods.value(42).simulate()).rejects.toThrow('Cannot satisfy constraint');
    });
  });
};

describe('e2e_account_contracts', () => {
  describe('schnorr single-key account', () => {
    itShouldBehaveLikeAnAccountContract((encryptionKey: GrumpkinScalar) => new SingleKeyAccountContract(encryptionKey));
  });

  describe('schnorr multi-key account', () => {
    itShouldBehaveLikeAnAccountContract(() => new SchnorrAccountContract(GrumpkinScalar.random()));
  });

  describe('ecdsa stored-key account', () => {
    itShouldBehaveLikeAnAccountContract(() => new EcdsaKAccountContract(randomBytes(32)));
  });
});
