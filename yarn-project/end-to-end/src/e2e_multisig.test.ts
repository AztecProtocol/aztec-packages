import { DefaultAccountContract, buildAppPayload, buildFeePayload } from '@aztec/accounts/defaults';
import {
  AccountManager,
  AccountWallet,
  AuthWitness,
  AuthWitnessProvider,
  ContractArtifact,
  DebugLogger,
  ExtendedNote,
  GrumpkinPrivateKey,
  GrumpkinScalar,
  Note,
  PXE,
  PublicKey,
  TxExecutionRequest,
  TxHash,
  Wallet,
  computeAuthWitMessageHash,
  computeMessageSecretHash,
  generatePublicKey,
} from '@aztec/aztec.js';
import { Fr } from '@aztec/aztec.js/fields';
import { AztecAddress } from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { pedersenHash } from '@aztec/foundation/crypto';
import {
  MultiSigAccountContract,
  MultiSigAccountContractArtifact,
  TestContract,
  TokenContract,
} from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 90_000;

describe('e2e_multisig', () => {
  jest.setTimeout(TIMEOUT);

  let pxe: PXE;
  let walletDeployer: Wallet;
  let walletA: Wallet;
  let walletB: Wallet;
  let walletC: Wallet;
  let walletD: Wallet;
  let logger: DebugLogger;
  let multisig: MultiSigAccountContract;
  let multisigWallet: AccountWallet;
  let testContract: TestContract;
  let teardown: () => Promise<void>;

  let privateKey: GrumpkinPrivateKey;
  let publicKey: PublicKey;

  beforeAll(async () => {
    ({
      pxe,
      wallets: [walletDeployer, walletA, walletB, walletC, walletD],
      logger,
      teardown,
    } = await setup(5));

    // This is the multisig encryption key
    privateKey = GrumpkinScalar.random();
    publicKey = generatePublicKey(privateKey);

    logger.info(`Multisig keys: private=${privateKey.toString()} public=${publicKey.toString()}`);

    // Deploy the multisig contract via an account manager
    const ownerAddresses = [walletA, walletB, walletC].map(w => w.getCompleteAddress().address);
    logger.info(`Multisig owners: ${ownerAddresses.map(a => a.toString()).join(', ')}`);
    const accountManager = getMultisigAccountManager(pxe, privateKey, ownerAddresses, 2);
    multisigWallet = await accountManager.waitDeploy();
    multisig = await MultiSigAccountContract.at(multisigWallet.getCompleteAddress().address, multisigWallet);
    logger.info(`Multisig deployed at: ${multisig.address.toString()}`);

    // Deploy a test contract for the multisig to interact with
    const deployedTestContract = await TestContract.deploy(walletDeployer).send().deployed();
    testContract = deployedTestContract.withWallet(multisigWallet);
    logger.info(`Test contract deployed at: ${testContract.address.toString()}`);
  }, 100_000);

  it('sends a tx to the test contract via the multisig with first two owners', async () => {
    // Set up the method we want to call on a contract with the multisig as the wallet
    const action = testContract.methods.emit_msg_sender();

    // We collect the signatures from each owner and register them using addAuthWitness
    const authWits = await collectSignatures(await action.create(), [walletA, walletB]);
    await Promise.all(authWits.map(w => multisigWallet.addAuthWitness(w)));

    // Send the tx after having added all auth witnesses from the signers
    // TODO: We should be able to call send() on the result of create()
    const tx = await action.send().wait();

    const logs = await pxe.getUnencryptedLogs({ txHash: tx.txHash });
    logger.info(`Tx logs: ${logs.logs.map(log => log.toHumanReadable())}`);
    logger.info(`Multisig address: ${multisig.address}`);
    logger.info(`Test contract address: ${testContract.address}`);
  });

  it.skip('sends a tx to the test contract via the multisig without the first owner signature', async () => {
    // Set up the method we want to call on a contract with the multisig as the wallet
    const action = testContract.methods.emit_msg_sender();

    // We collect the signatures from each owner and register them using addAuthWitness
    const authWits = await collectSignatures(await action.create(), [walletB, walletC]);
    await Promise.all(authWits.map(w => multisigWallet.addAuthWitness(w)));

    // Send the tx after having added all auth witnesses from the signers
    // TODO: We should be able to call send() on the result of create()
    const tx = await action.send().wait();

    const logs = await pxe.getUnencryptedLogs({ txHash: tx.txHash });
    logger.info(`Tx logs: ${logs.logs.map(log => log.toHumanReadable())}`);
    logger.info(`Multisig address: ${multisig.address}`);
    logger.info(`Test contract address: ${testContract.address}`);
  });

  it('refuses to send a tx without enough signers', async () => {
    // Set up the method we want to call on a contract with the multisig as the wallet
    const action = testContract.methods.emit_msg_sender();

    // We collect the signatures from only one owner
    const authWits = await collectSignatures(await action.create(), [walletA]);
    await Promise.all(authWits.map(w => multisigWallet.addAuthWitness(w)));

    // Trying to send the tx should fail at simulation
    await expect(action.send().wait()).rejects.toThrow();
  });

  it.only('receives a token transfer and then sends it to another account', async () => {
    // Deploy token contract
    console.log('deploying token');
    const token = await TokenContract.deploy(walletDeployer, walletDeployer.getCompleteAddress(), 'TOKEN', 'TKN', 18)
      .send()
      .deployed();
    const secret = Fr.random();
    const secretHash = computeMessageSecretHash(secret);
    const amount = 1000n;
    console.log('deployed token');

    // Have the walletDeployer mint 1000 tokens for itself as setup
    const { txHash: mintTxHash } = await token.methods.mint_private(amount, secretHash).send().wait();
    await addPendingShieldNoteToPXE(walletDeployer, token.address, amount, secretHash, mintTxHash);
    await token.methods.redeem_shield(walletDeployer.getCompleteAddress(), amount, secret).send().wait();
    expect(await token.methods.balance_of_private(walletDeployer.getCompleteAddress()).view()).toBe(amount);
    console.log('minted token to wLLWT DEPLOYER');

    // Transfer 200 tokens to the multisig
    await token.methods
      .transfer(walletDeployer.getCompleteAddress(), multisigWallet.getCompleteAddress(), 200n, 0)
      .send()
      .wait();
    expect(await token.methods.balance_of_private(multisigWallet.getCompleteAddress()).view()).toBe(200n);
    console.log('transfer tokens to multisig done');

    // Have the multisig forward 50 tokens to wallet
    const action = token
      .withWallet(multisigWallet)
      .methods.transfer(multisigWallet.getCompleteAddress(), walletA.getCompleteAddress(), 50n, 0);
    // compute message hash. caller = MultiSig (from addresses)
    const authWits = await collectSignatures(await action.create(), [walletA, walletB]);
    // add authwit to msg.sender
    await Promise.all(authWits.map(w => multisigWallet.addAuthWitness(w)));
    await action.send().wait();

    expect(await token.methods.balance_of_private(multisigWallet.getCompleteAddress()).view()).toBe(150n);
    expect(await token.methods.balance_of_private(walletA.getCompleteAddress()).view()).toBe(50n);
  });

  it('add a new owner to the multisig', async () => {
    // Set up the method we want to call on a contract with the multisig as the wallet
    //const action = testContract.methods.emit_msg_sender();
    const add = multisig.methods.add_owner(walletD.getCompleteAddress().address);

    // We collect the signatures from each owner and register them using addAuthWitness
    const authWits = await collectSignatures(await add.create(), [walletA, walletB]);
    await Promise.all(authWits.map(w => multisigWallet.addAuthWitness(w)));

    // This should go away soon!
    await multisigWallet.addCapsule(
      padArrayEnd(
        [walletA, walletB].map(w => w.getCompleteAddress().address),
        AztecAddress.ZERO,
        MULTISIG_MAX_OWNERS,
      ),
    );

    // Send the tx after having added all auth witnesses from the signers
    // TODO: We should be able to call send() on the result of create()
    const tx = await add.send().wait();
    const logs = await pxe.getUnencryptedLogs({ txHash: tx.txHash });
    logger.info(`Tx logs: ${logs.logs.map(log => log.toHumanReadable())}`);
  });

  afterAll(async () => {
    await teardown();
  });
});

const MULTISIG_MAX_OWNERS = 5;

class AccountManagerMultisigAccountContract extends DefaultAccountContract {
  constructor(private privateKey: GrumpkinPrivateKey, private owners: AztecAddress[], private threshold: number) {
    super(MultiSigAccountContractArtifact as ContractArtifact);
  }

  getDeploymentArgs() {
    return [
      padArrayEnd(this.owners, AztecAddress.ZERO, MULTISIG_MAX_OWNERS),
      this.privateKey.toBuffer(),
      this.threshold,
    ];
  }

  getAuthWitnessProvider(): AuthWitnessProvider {
    return {
      createAuthWitness(message: Fr): Promise<AuthWitness> {
        return Promise.resolve(new AuthWitness(message, []));
      },
    };
  }
}

function getMultisigAccountManager(
  pxe: PXE,
  privateKey: GrumpkinPrivateKey,
  owners: AztecAddress[],
  threshold: number,
) {
  return new AccountManager(pxe, privateKey, new AccountManagerMultisigAccountContract(privateKey, owners, threshold));
}

function getMessagesToSignFor(txRequest: TxExecutionRequest, owner: AztecAddress): Fr[] {
  return txRequest.authWitnesses.map(w =>
    Fr.fromBuffer(
      pedersenHash(
        [w.requestHash, owner.toField()].map(fr => fr.toBuffer()),
        0, // TODO: Use a non-zero generator point
      ),
    ),
  );
}

async function collectSignatures(txRequest: TxExecutionRequest, owners: Wallet[]): Promise<AuthWitness[]> {
  // TODO: Rewrite this using a flatMap instead of two loops because it'd look nicer

  const authWits: AuthWitness[] = [];
  for (const ownerWallet of owners) {
    const messagesToSign = getMessagesToSignFor(txRequest, ownerWallet.getCompleteAddress().address);
    for (const messageToSign of messagesToSign) {
      authWits.push(await ownerWallet.createAuthWitness(messageToSign));
    }
  }
  return authWits;
}

// Adapted from end-to-end/src/e2e_token_contract.test.ts
async function addPendingShieldNoteToPXE(
  wallet: Wallet,
  token: AztecAddress,
  amount: bigint,
  secretHash: Fr,
  txHash: TxHash,
) {
  const storageSlot = new Fr(5); // The storage slot of `pending_shields` is 5.
  const noteTypeId = new Fr(84114971101151129711410111011678111116101n); // TransparentNote

  const note = new Note([new Fr(amount), secretHash]);
  const extendedNote = new ExtendedNote(
    note,
    wallet.getCompleteAddress().address,
    token,
    storageSlot,
    noteTypeId,
    txHash,
  );
  await wallet.addNote(extendedNote);
}
