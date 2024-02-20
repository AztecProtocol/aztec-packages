import { buildAppPayload, buildFeePayload, hashPayload } from '@aztec/accounts/defaults';
import {
  AccountManager,
  AztecNode,
  DebugLogger,
  GrumpkinScalar,
  PXE,
  SentTx,
  SignerlessWallet,
  Wallet,
  generatePublicKey,
} from '@aztec/aztec.js';
import { Fr } from '@aztec/aztec.js/fields';
import { GrumpkinPrivateKey, PublicKey, UnencryptedL2Log } from '@aztec/circuit-types';
import { AztecAddress, GeneratorIndex } from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { pedersenHash } from '@aztec/foundation/crypto';
import { MultiSigAccountContract, MultiSigAccountContractArtifact, TestContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';
const TIMEOUT = 90_000;

describe('e2e_multisig', () => {
  jest.setTimeout(TIMEOUT);

  let aztecNode: AztecNode | undefined;
  let pxe: PXE;
  let walletDeployer: Wallet;
  let walletA: Wallet;
  let walletB: Wallet;
  let walletC: Wallet;
  let walletNotOwner: Wallet;
  let signerlessWallet: Wallet;
  let logger: DebugLogger;
  let multisig: MultiSigAccountContract;
  let testContract: TestContract;
  let teardown: () => Promise<void>;

  let privateKey: GrumpkinPrivateKey;
  let publicKey: PublicKey;

  beforeAll(async () => {
    ({
      aztecNode,
      pxe,
      wallets: [walletDeployer, walletA, walletB, walletC, walletNotOwner],
      logger,
      teardown,
    } = await setup(5));

    logger.info(
      `Multisig owners: ${[walletA, walletB, walletC].map(w => w.getCompleteAddress().address.toString()).join(', ')}`,
    );

    // This is the multisig encryption key
    privateKey = GrumpkinScalar.random();
    publicKey = generatePublicKey(privateKey);

    logger.info(`Multisig keys: private=${privateKey.toString()} public=${publicKey.toString()}`);

    // Deploy the multisig contract via an account manager
    // This API sucks, because we're sidestepping the manager because we don't have an AccountInterface for the multisig,
    // and we cannot have one because the multisig has no valid getAuthWitness for each action, but rather needs a collection
    // of them, so we'll need to tweak the AccountInterface in aztec.js to accommodate for that. Yay dogfooding!
    signerlessWallet = new SignerlessWallet(pxe);
    const salt = Fr.random();
    const accountManager = new AccountManager(
      pxe,
      privateKey,
      {
        getContractArtifact() {
          return MultiSigAccountContractArtifact;
        },
        getDeploymentArgs() {
          return [
            [...[walletA, walletB, walletC].map(w => w.getCompleteAddress()), AztecAddress.ZERO, AztecAddress.ZERO],
            privateKey.toBuffer(),
            2,
          ];
        },
        getInterface() {
          throw new Error('Unimplemented');
        },
      },
      salt,
    );
    const deployTx = (await accountManager.getDeployMethod()).send({ contractAddressSalt: salt });
    await new SentTx(pxe, deployTx.getTxHash()).wait();
    multisig = await MultiSigAccountContract.at(accountManager.getCompleteAddress().address, signerlessWallet);

    logger.info(`Multisig deployed at: ${multisig.address.toString()}`);

    // Deploy a test contract for the multisig to interact with
    testContract = await TestContract.deploy(walletDeployer).send().deployed();
    logger.info(`Test contract deployed at: ${testContract.address.toString()}`);
  }, 100_000);

  it('sends a tx to the test contract via the multisig', async () => {
    const addAuthWitnessesForPayload = async (payloadHash: Fr) => {
      const authWitAKey = Fr.fromBuffer(
        pedersenHash(
          [payloadHash, walletA.getCompleteAddress().address.toField()].map(fr => fr.toBuffer()),
          0,
        ),
      );
      const authWitA = await walletA.createAuthWitness(authWitAKey);
      const authWitBKey = Fr.fromBuffer(
        pedersenHash(
          [payloadHash, walletB.getCompleteAddress().address.toField()].map(fr => fr.toBuffer()),
          0,
        ),
      );
      const authWitB = await walletB.createAuthWitness(authWitBKey);

      logger.info(`Adding authwit for A: ${authWitAKey.toString()}`);
      await signerlessWallet.addAuthWitness(authWitA);
      logger.info(`Adding authwit for B: ${authWitBKey.toString()}`);
      await signerlessWallet.addAuthWitness(authWitB);
    };

    const call = testContract.methods.emit_msg_sender().request();
    const payload = buildAppPayload([call]);
    const payloadHash = Fr.fromBuffer(hashPayload(payload.payload, GeneratorIndex.SIGNATURE_PAYLOAD));
    logger.info(`App payload hash to check: ${payloadHash.toString()}`);
    await addAuthWitnessesForPayload(payloadHash);

    const feePayload = Fr.fromBuffer(hashPayload(buildFeePayload().payload, GeneratorIndex.FEE_PAYLOAD));
    await addAuthWitnessesForPayload(feePayload);

    await signerlessWallet.addCapsule(
      padArrayEnd(
        [walletA, walletB].map(w => w.getCompleteAddress().address),
        AztecAddress.ZERO,
        5,
      ),
    );

    const tx = await multisig.methods.entrypoint(payload.payload, buildFeePayload().payload).send().wait();

    const logs = await pxe.getUnencryptedLogs({ txHash: tx.txHash });
  });

  afterEach(async () => {
    await teardown();
  });
});