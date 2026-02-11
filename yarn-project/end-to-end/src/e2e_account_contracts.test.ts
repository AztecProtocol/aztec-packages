import { EcdsaKAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { SingleKeyAccountContract } from '@aztec/accounts/single_key';
import { type Account, type AccountContract, BaseAccount, getAccountContractAddress } from '@aztec/aztec.js/account';
import { AztecAddress, CompleteAddress } from '@aztec/aztec.js/addresses';
import { Fr, GrumpkinScalar } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { DefaultAccountEntrypoint } from '@aztec/entrypoints/account';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { createPXE, getPXEConfig } from '@aztec/pxe/server';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import { setup } from './fixtures/utils.js';
import { TestWallet } from './test-wallet/test_wallet.js';
import { AztecNodeProxy } from './test-wallet/utils.js';

export class TestWalletInternals extends TestWallet {
  static override async create(node: AztecNode): Promise<TestWalletInternals> {
    const pxeConfig = getPXEConfig();
    pxeConfig.proverEnabled = false;
    const nodeRef = new AztecNodeProxy(node);
    const pxe = await createPXE(nodeRef, pxeConfig);
    return new TestWalletInternals(pxe, nodeRef);
  }

  replaceAccountAt(account: Account, address: AztecAddress) {
    this.accounts.set(address.toString(), account);
  }
}

const itShouldBehaveLikeAnAccountContract = (
  getAccountContract: (encryptionKey: GrumpkinScalar) => AccountContract,
) => {
  describe(`behaves like an account contract`, () => {
    let aztecNode: AztecNode;
    let logger: Logger;
    let teardown: () => Promise<void>;
    let wallet: TestWalletInternals;
    let completeAddress: CompleteAddress;
    let child: ChildContract;

    beforeAll(async () => {
      const secret = Fr.random();
      const salt = Fr.random();
      const signingKey = deriveSigningKey(secret);
      const contract = getAccountContract(signingKey);
      const address = await getAccountContractAddress(contract, secret, salt);
      const accountData = {
        secret,
        signingKey,
        salt,
        address,
      };

      ({ logger, teardown, aztecNode } = await setup(0, { initialFundedAccounts: [accountData] }));
      wallet = await TestWalletInternals.create(aztecNode);

      const accountManager = await wallet.createAccount({ secret, contract, salt });
      completeAddress = await accountManager.getCompleteAddress();
      if (await accountManager.hasInitializer()) {
        // The account is pre-funded and can pay for its own fee.
        const deployMethod = await accountManager.getDeployMethod();
        await deployMethod.send({ from: AztecAddress.ZERO });
      }

      child = await ChildContract.deploy(wallet).send({ from: address });
    });

    afterAll(() => teardown());

    it('calls a private function', async () => {
      logger.info('Calling private function...');
      await child.methods.value(42).send({ from: completeAddress.address });
    });

    it('calls a public function', async () => {
      logger.info('Calling public function...');
      await child.methods.pub_inc_value(42).send({ from: completeAddress.address });
      const storedValue = await aztecNode.getPublicStorageAt('latest', child.address, new Fr(1));
      expect(storedValue).toEqual(new Fr(42n));
    });

    it('fails to call a function using an invalid signature', async () => {
      const randomContract = getAccountContract(GrumpkinScalar.random());
      const authWitnessProvider = randomContract.getAuthWitnessProvider(completeAddress);
      const account = new BaseAccount(
        new DefaultAccountEntrypoint(completeAddress.address, authWitnessProvider),
        authWitnessProvider,
        completeAddress,
      );
      wallet.replaceAccountAt(account, completeAddress.address);
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
