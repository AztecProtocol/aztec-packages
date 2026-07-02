import { EcdsaKAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract, SchnorrInitializerlessAccountContract } from '@aztec/accounts/schnorr';
import {
  type Account,
  type AccountContract,
  BaseAccount,
  NO_FROM,
  getAccountContractAddress,
} from '@aztec/aztec.js/account';
import { AztecAddress, CompleteAddress } from '@aztec/aztec.js/addresses';
import { Fr, GrumpkinScalar } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { DefaultAccountEntrypoint } from '@aztec/entrypoints/account';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { createPXE, getPXEConfig } from '@aztec/pxe/server';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import { TestWallet } from '../../test-wallet/test_wallet.js';
import { AztecNodeProxy } from '../../test-wallet/utils.js';
import { AutomineTestContext } from '../automine_test_context.js';

export class TestWalletInternals extends TestWallet {
  static override async create(node: AztecNode): Promise<TestWalletInternals> {
    const pxeConfig = getPXEConfig();
    pxeConfig.proverEnabled = false;
    const nodeRef = new AztecNodeProxy(node);
    const pxe = await createPXE(nodeRef, pxeConfig);
    return new TestWalletInternals(pxe, nodeRef);
  }

  replaceAccountAt(account: Account, address: AztecAddress) {
    const existing = this.accounts.get(address.toString());
    this.accounts.set(address.toString(), { account, type: existing!.type });
  }
}

const itShouldBehaveLikeAnAccountContract = (
  getAccountContract: (encryptionKey: GrumpkinScalar) => AccountContract,
) => {
  // Shared suite parametrized over account contract type. Creates one account from the supplied
  // AccountContract implementation (deploying it only if it has an initializer — initializerless
  // variants skip the deploy tx) and exercises private calls, public calls, and signature failure.
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

      ({ logger, teardown, aztecNode } = (
        await AutomineTestContext.setup({
          numberOfAccounts: 0,
          additionallyFundedAccounts: [accountData],
        })
      ).context);
      wallet = await TestWalletInternals.create(aztecNode);

      const accountManager = await wallet.createAccount({ secret, contract, salt });
      completeAddress = await accountManager.getCompleteAddress();

      if (await accountManager.hasInitializer()) {
        const deployMethod = await accountManager.getDeployMethod();
        await deployMethod.send({ from: NO_FROM });
      }

      ({ contract: child } = await ChildContract.deploy(wallet).send({ from: address }));
    });

    afterAll(() => teardown());

    // Sends a private function call on ChildContract and asserts it does not revert.
    it('calls a private function', async () => {
      logger.info('Calling private function...');
      await child.methods.value(42).send({ from: completeAddress.address });
    });

    // Calls pub_inc_value on the deployed Child contract and reads the resulting stored value via the node.
    it('calls a public function', async () => {
      logger.info('Calling public function...');
      await child.methods.pub_inc_value(42).send({ from: completeAddress.address });
      const storedValue = await aztecNode.getPublicStorageAt('latest', child.address, new Fr(1));
      expect(storedValue).toEqual(new Fr(42n));
    });

    // Swaps out the account's AuthWitnessProvider for one holding a random key, then simulates
    // a private call and expects a "Cannot satisfy constraint" rejection.
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

// Tests that multiple account contract implementations (Schnorr, Schnorr-initializerless, and ECDSA
// stored-key) satisfy the common account contract interface. Each variant gets its own
// setup(0, AUTOMINE_E2E_OPTS) with an additionallyFundedAccounts override, one node, automine sequencer,
// no extra nodes. (v5: added the initializerless variant and renamed initialFundedAccounts →
// additionallyFundedAccounts.)
describe('automine/accounts/account_contracts', () => {
  describe('schnorr account', () => {
    itShouldBehaveLikeAnAccountContract(() => new SchnorrAccountContract(GrumpkinScalar.random()));
  });

  describe('schnorr initializerless account', () => {
    itShouldBehaveLikeAnAccountContract(() => new SchnorrInitializerlessAccountContract(GrumpkinScalar.random()));
  });

  describe('ecdsa stored-key account', () => {
    itShouldBehaveLikeAnAccountContract(() => new EcdsaKAccountContract(randomBytes(32)));
  });
});
