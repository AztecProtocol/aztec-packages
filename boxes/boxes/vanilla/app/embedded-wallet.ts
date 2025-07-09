import {
  Fr,
  createLogger,
  createAztecNodeClient,
  AztecAddress,
  getContractInstanceFromInstantiationParams,
  ContractFunctionInteraction,
  SponsoredFeePaymentMethod,
  type PXE,
  AccountWallet,
} from '@aztec/aztec.js';
import { SponsoredFPCContractArtifact } from '@aztec/noir-contracts.js/SponsoredFPC';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { randomBytes } from '@aztec/foundation/crypto';
import { getEcdsaRAccount } from '@aztec/accounts/ecdsa/lazy';
import { getSchnorrAccount } from '@aztec/accounts/schnorr/lazy';
import { getPXEServiceConfig } from '@aztec/pxe/config';
import { createPXEService } from '@aztec/pxe/client/lazy';
import { type ContractArtifact, getDefaultInitializer } from '@aztec/stdlib/abi';
import { getInitialTestAccounts } from '@aztec/accounts/testing';

const PROVER_ENABLED = true;

const logger = createLogger('wallet');
const LocalStorageKey = 'aztec-account';

// This is a minimal implementation of an Aztec wallet, that saves the private keys in local storage.
// This does not implement `@aztec.js/Wallet` interface though
// This is not meant for production use
export class EmbeddedWallet {
  private pxe!: PXE;
  connectedAccount: AccountWallet | null = null;

  constructor(private nodeUrl: string) {}

  async initialize() {
    // Create Aztec Node Client
    const aztecNode = await createAztecNodeClient(this.nodeUrl);

    // Create PXE Service
    const config = getPXEServiceConfig();
    config.l1Contracts = await aztecNode.getL1ContractAddresses();
    config.proverEnabled = PROVER_ENABLED;
    this.pxe = await createPXEService(aztecNode, config, {
      useLogSuffix: true,
    });

    // Register Sponsored FPC Contract with PXE
    await this.pxe.registerContract({
      instance: await this.#getSponsoredPFCContract(),
      artifact: SponsoredFPCContractArtifact,
    });

    // Log the Node Info
    const nodeInfo = await this.pxe.getNodeInfo();
    logger.info('PXE Connected to node', nodeInfo);
  }

  // Internal method to use the Sponsored FPC Contract for fee payment
  async #getSponsoredPFCContract() {
    const instance = await getContractInstanceFromInstantiationParams(
      SponsoredFPCContractArtifact,
      {
        salt: new Fr(SPONSORED_FPC_SALT),
      }
    );

    return instance;
  }

  getConnectedAccount() {
    if (!this.connectedAccount) {
      return null;
    }
    return this.connectedAccount;
  }

  async connectTestAccount(index: number) {
    const testAccounts = await getInitialTestAccounts();
    const account = testAccounts[index];
    const schnorrAccount = await getSchnorrAccount(this.pxe, account.secret, account.signingKey, account.salt);

    await schnorrAccount.register();
    const wallet = await schnorrAccount.getWallet();

    this.connectedAccount = wallet;
    return wallet;
  }

  // Create a new account
  async createAccountAndConnect() {
    if (!this.pxe) {
      throw new Error('PXE not initialized');
    }

    // Generate a random salt, secret key, and signing key
    const salt = Fr.random();
    const secretKey = Fr.random();
    const signingKey = randomBytes(32);

    // Create an ECDSA account
    const ecdsaAccount = await getEcdsaRAccount(
      this.pxe,
      secretKey,
      signingKey,
      salt
    );

    // Deploy the account
    const deployMethod = await ecdsaAccount.getDeployMethod();
    const sponsoredPFCContract = await this.#getSponsoredPFCContract();
    const deployOpts = {
      contractAddressSalt: Fr.fromString(ecdsaAccount.salt.toString()),
      fee: {
        paymentMethod: await ecdsaAccount.getSelfPaymentMethod(
          new SponsoredFeePaymentMethod(sponsoredPFCContract.address)
        ),
      },
      universalDeploy: true,
      skipClassPublication: true,
      skipInstancePublication: true,
    };

    const provenInteraction = await deployMethod.prove(deployOpts);
    const receipt = await provenInteraction.send().wait({ timeout: 120 });

    logger.info('Account deployed', receipt);

    // Store the account in local storage
    const ecdsaWallet = await ecdsaAccount.getWallet();
    localStorage.setItem(
      LocalStorageKey,
      JSON.stringify({
        address: ecdsaWallet.getAddress().toString(),
        signingKey: signingKey.toString('hex'),
        secretKey: secretKey.toString(),
        salt: salt.toString(),
      })
    );

    // Register the account with PXE
    await ecdsaAccount.register();
    this.connectedAccount = ecdsaWallet;

    return ecdsaWallet;
  }

  async connectExistingAccount() {
    // Read key from local storage and create the account
    const account = localStorage.getItem(LocalStorageKey);
    if (!account) {
      return null;
    }
    const parsed = JSON.parse(account);

    const ecdsaAccount = await getEcdsaRAccount(
      this.pxe,
      Fr.fromString(parsed.secretKey),
      Buffer.from(parsed.signingKey, 'hex'),
      Fr.fromString(parsed.salt)
    );

    await ecdsaAccount.register();
    const ecdsaWallet = await ecdsaAccount.getWallet();

    this.connectedAccount = ecdsaWallet;
    return ecdsaWallet;
  }

  // Register a contract with PXE
  async registerContract(
    artifact: ContractArtifact,
    deployer: AztecAddress,
    deploymentSalt: Fr,
    constructorArgs: any[]
  ) {
    const instance = await getContractInstanceFromInstantiationParams(artifact, {
      constructorArtifact: getDefaultInitializer(artifact),
      constructorArgs: constructorArgs,
      deployer: deployer,
      salt: deploymentSalt,
    });

    await this.pxe.registerContract({
      instance,
      artifact,
    });
  }

  // Send a transaction with the Sponsored FPC Contract for fee payment
  async sendTransaction(interaction: ContractFunctionInteraction) {
    const sponsoredPFCContract = await this.#getSponsoredPFCContract();
    const provenInteraction = await interaction.prove({
      fee: {
        paymentMethod: new SponsoredFeePaymentMethod(
          sponsoredPFCContract.address
        ),
      },
    });

    await provenInteraction.send().wait({ timeout: 120 });
  }

  // Simulate a transaction
  async simulateTransaction(interaction: ContractFunctionInteraction) {
    const res = await interaction.simulate();
    return res;
  }
}
