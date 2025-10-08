import { DefaultAccountContract } from '@aztec/accounts/defaults';
import {
  AuthWitness,
  type AuthWitnessProvider,
  type CompleteAddress,
  type ContractArtifact,
  Fr,
  GrumpkinScalar,
  Schnorr,
} from '@aztec/aztec.js';
import { SchnorrHardcodedAccountContractArtifact } from '@aztec/noir-contracts.js/SchnorrHardcodedAccount';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TestWallet } from '@aztec/test-wallet/server';

import { setup } from '../fixtures/utils.js';

const PRIVATE_KEY = GrumpkinScalar.fromHexString('0xd35d743ac0dfe3d6dbe6be8c877cb524a00ab1e3d52d7bada095dfc8894ccfa');

/** Account contract implementation that authenticates txs using Schnorr signatures. */
class SchnorrHardcodedKeyAccountContract extends DefaultAccountContract {
  constructor(private privateKey = PRIVATE_KEY) {
    super();
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(SchnorrHardcodedAccountContractArtifact);
  }

  getInitializationFunctionAndArgs() {
    // This contract has no constructor
    return Promise.resolve(undefined);
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    const privateKey = this.privateKey;
    return {
      async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
        const signer = new Schnorr();
        const signature = await signer.constructSignature(messageHash.toBuffer(), privateKey);
        return Promise.resolve(new AuthWitness(messageHash, [...signature.toBuffer()]));
      },
    };
  }
}

describe('guides/writing_an_account_contract', () => {
  let context: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    context = await setup(1);
  });

  afterEach(() => context.teardown());

  it('works', async () => {
    const {
      logger,
      wallet,
      accounts: [fundedAccount],
    } = context;

    const secretKey = Fr.random();

    const account = await (wallet as TestWallet).createAccount({
      secret: secretKey,
      contract: new SchnorrHardcodedKeyAccountContract(),
      salt: Fr.random(),
    });

    if (await account.hasInitializer()) {
      // The account has no funds. Use a funded wallet to pay for the fee for the deployment.
      const deployMethod = await account.getDeployMethod();
      await deployMethod.send({ from: fundedAccount }).wait();
    }

    const address = account.address;
    logger.info(`Deployed account contract at ${address}`);

    const token = await TokenContract.deploy(wallet, fundedAccount, 'TokenName', 'TokenSymbol', 18)
      .send({ from: fundedAccount })
      .deployed();
    logger.info(`Deployed token contract at ${token.address}`);

    const mintAmount = 50n;
    await token.methods.mint_to_private(address, mintAmount).send({ from: fundedAccount }).wait();

    const balance = await token.methods.balance_of_private(address).simulate({ from: address });
    logger.info(`Balance of wallet is now ${balance}`);
    expect(balance).toEqual(50n);

    const wrongKey = GrumpkinScalar.random();
    const wrongAccountContract = new SchnorrHardcodedKeyAccountContract(wrongKey);
    const wrongAccount = await (wallet as TestWallet).createAccount({
      secret: secretKey,
      contract: wrongAccountContract,
      salt: Fr.random(),
    });

    try {
      await token.methods.mint_to_public(address, 200).prove({ from: wrongAccount.address });
    } catch (err) {
      logger.info(`Failed to send tx: ${err}`);
    }
  });
});
