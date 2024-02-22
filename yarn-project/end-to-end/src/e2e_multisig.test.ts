import { DefaultAccountContract } from '@aztec/accounts/defaults';
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
    const authWits = await collectSignatures(getRequestsFromTxRequest(await action.create()), [walletA, walletB]);
    await Promise.all(authWits.map(w => multisigWallet.addAuthWitness(w)));

    // Send the tx after having added all auth witnesses from the signers
    // TODO: We should be able to call send() on the result of create()
    const tx = await action.send().wait();

    const logs = await pxe.getUnencryptedLogs({ txHash: tx.txHash });
    logger.info(`Tx logs: ${logs.logs.map(log => log.toHumanReadable())}`);
    logger.info(`Multisig address: ${multisig.address}`);
    logger.info(`Test contract address: ${testContract.address}`);
  });

  it('sends a tx to the test contract via the multisig without the first owner signature', async () => {
    // Set up the method we want to call on a contract with the multisig as the wallet
    const action = testContract.methods.emit_msg_sender();

    // We collect the signatures from each owner and register them using addAuthWitness
    const authWits = await collectSignatures(getRequestsFromTxRequest(await action.create()), [walletB, walletC]);
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
    const authWits = await collectSignatures(getRequestsFromTxRequest(await action.create()), [walletA]);
    await Promise.all(authWits.map(w => multisigWallet.addAuthWitness(w)));

    // Trying to send the tx should fail at simulation
    await expect(action.send().wait()).rejects.toThrow();
  });

  describe('with a token contract', () => {
    let token: TokenContract;

    beforeAll(async () => {
      // Deploy token contract
      token = await TokenContract.deploy(walletDeployer, walletDeployer.getCompleteAddress(), 'TOKEN', 'TKN', 18)
        .send()
        .deployed();
      const secret = Fr.random();
      const secretHash = computeMessageSecretHash(secret);
      const amount = 1000n;

      // Have the walletDeployer mint 1000 tokens for itself as setup
      const { txHash: mintTxHash } = await token.methods.mint_private(amount, secretHash).send().wait();
      await addPendingShieldNoteToPXE(walletDeployer, token.address, amount, secretHash, mintTxHash);
      await token.methods.redeem_shield(walletDeployer.getCompleteAddress(), amount, secret).send().wait();
      expect(await token.methods.balance_of_private(walletDeployer.getCompleteAddress()).view()).toBe(amount);

      // Transfer 200 tokens to the multisig
      await token.methods
        .transfer(walletDeployer.getCompleteAddress(), multisigWallet.getCompleteAddress(), 200n, 0)
        .send()
        .wait();
      expect(await token.methods.balance_of_private(multisigWallet.getCompleteAddress()).view()).toBe(200n);
      logger.info(`Successfully transferred 200 tokens to the multisig`);
    });

    it('sends tokens from multisig as msg.sender', async () => {
      const signers = [walletA, walletB];
      const transferAction = token
        .withWallet(multisigWallet)
        .methods.transfer(multisigWallet.getCompleteAddress(), walletA.getCompleteAddress(), 50n, 0);
      const authWits = await collectSignatures(getRequestsFromTxRequest(await transferAction.create()), signers);
      await Promise.all(authWits.map(w => multisigWallet.addAuthWitness(w)));
      await transferAction.send().wait();

      expect(await token.methods.balance_of_private(multisigWallet.getCompleteAddress()).view()).toBe(150n);
      expect(await token.methods.balance_of_private(walletA.getCompleteAddress()).view()).toBe(50n);
      logger.info(`Successfully sent 50 tokens directly`);
    });

    it('sends token from multisig via authwit', async () => {
      const signers = [walletA, walletB];
      const recipient = walletC.getCompleteAddress();
      const amount = 25n;
      const nonce = Fr.random();
      const sender = walletB.getCompleteAddress().address;

      const action = token
        .withWallet(walletB)
        .methods.transfer(multisigWallet.getCompleteAddress(), recipient, amount, nonce);

      const transferFromAuthWitRequest = Fr.fromBuffer(computeAuthWitMessageHash(sender, action.request()));
      logger.info(`AuthWit request for transferFrom: ${transferFromAuthWitRequest.toString()}`);
      const transferFromAuthWits = await collectSignatures([transferFromAuthWitRequest], signers);
      logger.info(
        `AuthWit requests for transferFrom for each signer (${signers
          .map(s => s.getCompleteAddress().address.toString())
          .join(' ')}): ${transferFromAuthWits.map(w => w.requestHash.toString()).join(' ')}`,
      );
      await Promise.all(transferFromAuthWits.map(w => walletB.addAuthWitness(w)));
      await action.send().wait();

      expect(await token.methods.balance_of_private(recipient).view()).toBe(amount);
      logger.info(`Successfully sent 25 tokens from another account via authwit`);
    });
  });

  it('add a new owner to the multisig', async () => {
    // Set up the method we want to call on a contract with the multisig as the wallet
    const addAction = multisig.methods.update_config(
      [
        walletA.getCompleteAddress().address,
        walletB.getCompleteAddress().address,
        walletC.getCompleteAddress().address,
        walletD.getCompleteAddress().address,
        AztecAddress.zero(),
      ],
      3,
    );

    // We collect the signatures from each owner and register them using addAuthWitness
    const authWits = await collectSignatures(getRequestsFromTxRequest(await addAction.create()), [walletA, walletB]);
    await Promise.all(authWits.map(w => multisigWallet.addAuthWitness(w)));

    // Send the tx after having added all auth witnesses from the signers
    // TODO: We should be able to call send() on the result of create()
    await addAction.send().wait();

    const owners: Fr[] = await multisig.methods.get_owners().view();
    expect(await multisig.methods.get_threshold().view()).toBe(3n);
    expect(owners.filter(owner => !owner.isZero()).length).toBe(4);
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

// Returns the requests to sign for a given tx request
function getRequestsFromTxRequest(txRequest: TxExecutionRequest) {
  return txRequest.authWitnesses.map(w => w.requestHash);
}

// Given a set of requests and an owner, returns the request that the owner needs to sign
function getRequestsToSignFor(requests: Fr[], owner: AztecAddress): Fr[] {
  return requests.map(request =>
    Fr.fromBuffer(
      pedersenHash(
        [request, owner.toField()].map(fr => fr.toBuffer()),
        0, // TODO: Use a non-zero generator point
      ),
    ),
  );
}

// Returns authwitnesses signed by the `owners` wallets for each of the `requests`
async function collectSignatures(requests: Fr[], owners: Wallet[]): Promise<AuthWitness[]> {
  // TODO: Rewrite this using a flatMap instead of two loops because it'd look nicer

  const authWits: AuthWitness[] = [];
  for (const ownerWallet of owners) {
    const messagesToSign = getRequestsToSignFor(requests, ownerWallet.getCompleteAddress().address);
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
