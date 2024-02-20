import { DefaultAccountContract } from '@aztec/accounts/defaults';
import {
  AccountManager,
  AccountWallet,
  AuthWitness,
  AuthWitnessProvider,
  ContractArtifact,
  DebugLogger,
  GrumpkinPrivateKey,
  GrumpkinScalar,
  PXE,
  PublicKey,
  TxExecutionRequest,
  Wallet,
  generatePublicKey,
} from '@aztec/aztec.js';
import { Fr } from '@aztec/aztec.js/fields';
import { AztecAddress } from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { pedersenHash } from '@aztec/foundation/crypto';
import { MultiSigAccountContract, MultiSigAccountContractArtifact, TestContract } from '@aztec/noir-contracts.js';

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
      wallets: [walletDeployer, walletA, walletB, walletC],
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

  it('sends a tx to the test contract via the multisig', async () => {
    // Set up the method we want to call on a contract with the multisig as the wallet
    const action = testContract.methods.emit_msg_sender();

    // We collect the signatures from each owner and register them using addAuthWitness
    const authWits = await collectSignatures(await action.create(), [walletA, walletB]);
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
    const tx = await action.send().wait();

    const logs = await pxe.getUnencryptedLogs({ txHash: tx.txHash });
    logger.info(`Tx logs: ${logs.logs.map(log => log.toHumanReadable())}`);
    logger.info(`Multisig address: ${multisig.address}`);
    logger.info(`Test contract address: ${testContract.address}`);
  });

  afterEach(async () => {
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
