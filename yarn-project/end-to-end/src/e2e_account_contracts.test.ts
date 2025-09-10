import { DefaultAccountInterface } from '@aztec/accounts/defaults';
import { EcdsaKAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { SingleKeyAccountContract } from '@aztec/accounts/single_key';
import {
  type Account,
  type AccountContract,
  AccountManager,
  AztecAddress,
  BaseAccount,
  CompleteAddress,
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
import { TestWallet } from '@aztec/test-wallet';

import { setup } from './fixtures/utils.js';

export class TestWalletInternals extends TestWallet {
  replaceAccountAt(account: Account, address: AztecAddress) {
    this.accounts.set(address.toString(), account);
  }
}

const itShouldBehaveLikeAnAccountContract = (
  getAccountContract: (encryptionKey: GrumpkinScalar) => AccountContract,
) => {
  describe(`behaves like an account contract`, () => {
    let pxe: PXE;
    let logger: Logger;
    let teardown: () => Promise<void>;
    let wallet: Wallet;
    let completeAddress: CompleteAddress;
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

      ({ logger, pxe, teardown } = await setup(0, { initialFundedAccounts: [accountData] }));
      wallet = new TestWalletInternals(pxe);

      const accountManager = await AccountManager.create(wallet, pxe, secret, accountContract, salt);
      completeAddress = await accountManager.getCompleteAddress();
      if (await accountManager.hasInitializer()) {
        // The account is pre-funded and can pay for its own fee.
        const paymentMethod = new FeeJuicePaymentMethod(address);
        await accountManager.deploy({ fee: { paymentMethod } }).wait();
      } else {
        await accountManager.register();
      }

      (wallet as TestWalletInternals).replaceAccountAt(await accountManager.getAccount(), address);

      child = await ChildContract.deploy(wallet).send({ from: address }).deployed();
    });

    afterAll(() => teardown());

    it('calls a private function', async () => {
      logger.info('Calling private function...');
      await child.methods.value(42).send({ from: completeAddress.address }).wait({ interval: 0.1 });
    });

    it('calls a public function', async () => {
      logger.info('Calling public function...');
      await child.methods.pub_inc_value(42).send({ from: completeAddress.address }).wait({ interval: 0.1 });
      const storedValue = await pxe.getPublicStorageAt(child.address, new Fr(1));
      expect(storedValue).toEqual(new Fr(42n));
    });

    it('fails to call a function using an invalid signature', async () => {
      const randomContract = getAccountContract(GrumpkinScalar.random());
      const accountInterface = new DefaultAccountInterface(
        randomContract.getAuthWitnessProvider(completeAddress),
        completeAddress,
        await pxe.getNodeInfo(),
      );
      const account = new BaseAccount(accountInterface);
      (wallet as TestWalletInternals).replaceAccountAt(account, completeAddress.address);
      await expect(child.methods.value(42).simulate({ from: completeAddress.address })).rejects.toThrow(
        'Cannot satisfy constraint',
      );
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
