import {
  AccountManager,
  AuthWitness,
  AuthWitnessProvider,
  BaseAccountContract,
  CompleteAddress,
  ExtendedNote,
  Fr,
  GrumpkinPrivateKey,
  GrumpkinScalar,
  Note,
  Schnorr,
  computeMessageSecretHash,
} from '@aztec/aztec.js';
import { SchnorrHardcodedAccountContractArtifact } from '@aztec/noir-contracts/SchnorrHardcodedAccount';
import { TokenContract } from '@aztec/noir-contracts/Token';

import { setup } from '../fixtures/utils.js';

// docs:start:account-contract
const PRIVATE_KEY = GrumpkinScalar.fromString('0xd35d743ac0dfe3d6dbe6be8c877cb524a00ab1e3d52d7bada095dfc8894ccfa');

/** Account contract implementation that authenticates txs using Schnorr signatures. */
class SchnorrHardcodedKeyAccountContract extends BaseAccountContract {
  constructor(private privateKey: GrumpkinPrivateKey = PRIVATE_KEY) {
    super(SchnorrHardcodedAccountContractArtifact);
  }

  getDeploymentArgs(): any[] {
    // This contract does not require any arguments in its constructor.
    return [];
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    const privateKey = this.privateKey;
    return {
      createAuthWitness(message: Fr): Promise<AuthWitness> {
        const signer = new Schnorr();
        const signature = signer.constructSignature(message.toBuffer(), privateKey);
        return Promise.resolve(new AuthWitness(message, [...signature.toBuffer()]));
      },
    };
  }
}
// docs:end:account-contract

describe('guides/writing_an_account_contract', () => {
  let context: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    context = await setup(0);
  }, 60_000);

  afterEach(() => context.teardown());

  it('works', async () => {
    const { pxe, logger } = context;
    // docs:start:account-contract-deploy
    const encryptionPrivateKey = GrumpkinScalar.random();
    const account = new AccountManager(pxe, encryptionPrivateKey, new SchnorrHardcodedKeyAccountContract());
    const wallet = await account.waitDeploy();
    const address = wallet.getCompleteAddress().address;
    // docs:end:account-contract-deploy
    logger(`Deployed account contract at ${address}`);

    // docs:start:account-contract-works
    const token = await TokenContract.deploy(wallet, { address }).send().deployed();
    logger(`Deployed token contract at ${token.address}`);

    const secret = Fr.random();
    const secretHash = computeMessageSecretHash(secret);

    const mintAmount = 50n;
    const receipt = await token.methods.mint_private(mintAmount, secretHash).send().wait();

    const storageSlot = new Fr(5);
    const note = new Note([new Fr(mintAmount), secretHash]);
    const extendedNote = new ExtendedNote(note, address, token.address, storageSlot, receipt.txHash);
    await pxe.addNote(extendedNote);

    await token.methods.redeem_shield({ address }, mintAmount, secret).send().wait();

    const balance = await token.methods.balance_of_private({ address }).view();
    logger(`Balance of wallet is now ${balance}`);
    // docs:end:account-contract-works
    expect(balance).toEqual(50n);

    // docs:start:account-contract-fails
    const walletAddress = wallet.getCompleteAddress();
    const wrongKey = GrumpkinScalar.random();
    const wrongAccountContract = new SchnorrHardcodedKeyAccountContract(wrongKey);
    const wrongAccount = new AccountManager(pxe, encryptionPrivateKey, wrongAccountContract, walletAddress);
    const wrongWallet = await wrongAccount.getWallet();
    const tokenWithWrongWallet = token.withWallet(wrongWallet);

    try {
      await tokenWithWrongWallet.methods.mint_private(200, secretHash).simulate();
    } catch (err) {
      logger(`Failed to send tx: ${err}`);
    }
    // docs:end:account-contract-fails
  }, 60_000);
});
