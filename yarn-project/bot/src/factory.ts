import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import {
  type AccountWallet,
  BatchCall,
  type DeployMethod,
  type DeployOptions,
  createLogger,
  createPXEClient,
  retryUntil,
} from '@aztec/aztec.js';
import { type AztecNode, type FunctionCall, type PXE } from '@aztec/circuit-types';
import { Fr, deriveSigningKey } from '@aztec/circuits.js';
import { EasyPrivateTokenContract } from '@aztec/noir-contracts.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { type BotConfig, SupportedTokenContracts } from './config.js';
import { getBalances, getPrivateBalance, isStandardTokenContract } from './utils.js';

const MINT_BALANCE = 1e12;
const MIN_BALANCE = 1e3;

export class BotFactory {
  private pxe: PXE;
  private node?: AztecNode;
  private log = createLogger('bot');

  constructor(private readonly config: BotConfig, dependencies: { pxe?: PXE; node?: AztecNode } = {}) {
    if (config.flushSetupTransactions && !dependencies.node) {
      throw new Error(`Either a node client or node url must be provided if transaction flushing is requested`);
    }
    if (!dependencies.pxe && !config.pxeUrl) {
      throw new Error(`Either a PXE client or a PXE URL must be provided`);
    }

    this.node = dependencies.node;

    if (dependencies.pxe) {
      this.log.info(`Using local PXE`);
      this.pxe = dependencies.pxe;
      return;
    }
    this.log.info(`Using remote PXE at ${config.pxeUrl!}`);
    this.pxe = createPXEClient(config.pxeUrl!);
  }

  /**
   * Initializes a new bot by setting up the sender account, registering the recipient,
   * deploying the token contract, and minting tokens if necessary.
   */
  public async setup() {
    const recipient = await this.registerRecipient();
    const wallet = await this.setupAccount();
    const token = await this.setupToken(wallet);
    await this.mintTokens(token);
    return { wallet, token, pxe: this.pxe, recipient };
  }

  /**
   * Checks if the sender account contract is initialized, and initializes it if necessary.
   * @returns The sender wallet.
   */
  private async setupAccount() {
    const salt = Fr.ONE;
    const signingKey = deriveSigningKey(this.config.senderPrivateKey);
    const account = getSchnorrAccount(this.pxe, this.config.senderPrivateKey, signingKey, salt);
    const isInit = await this.pxe.isContractInitialized(account.getAddress());
    if (isInit) {
      this.log.info(`Account at ${account.getAddress().toString()} already initialized`);
      const wallet = await account.register();
      const blockNumber = await this.pxe.getBlockNumber();
      await retryUntil(
        async () => {
          const status = await this.pxe.getSyncStatus();
          return blockNumber <= status.blocks;
        },
        'pxe synch',
        3600,
        1,
      );
      return wallet;
    } else {
      this.log.info(`Initializing account at ${account.getAddress().toString()}`);
      const sentTx = account.deploy();
      const txHash = await sentTx.getTxHash();
      this.log.info(`Sent tx with hash ${txHash.toString()}`);
      if (this.config.flushSetupTransactions) {
        this.log.verbose('Flushing transactions');
        await this.node!.flushTxs();
      }
      this.log.verbose('Waiting for account deployment to settle');
      await sentTx.wait({ timeout: this.config.txMinedWaitSeconds });
      return account.getWallet();
    }
  }

  /**
   * Registers the recipient for txs in the pxe.
   */
  private async registerRecipient() {
    const recipient = await this.pxe.registerAccount(this.config.recipientEncryptionSecret, Fr.ONE);
    return recipient.address;
  }

  /**
   * Checks if the token contract is deployed and deploys it if necessary.
   * @param wallet - Wallet to deploy the token contract from.
   * @returns The TokenContract instance.
   */
  private async setupToken(wallet: AccountWallet): Promise<TokenContract | EasyPrivateTokenContract> {
    let deploy: DeployMethod<TokenContract | EasyPrivateTokenContract>;
    const deployOpts: DeployOptions = { contractAddressSalt: this.config.tokenSalt, universalDeploy: true };
    if (this.config.contract === SupportedTokenContracts.TokenContract) {
      deploy = TokenContract.deploy(wallet, wallet.getAddress(), 'BotToken', 'BOT', 18);
    } else if (this.config.contract === SupportedTokenContracts.EasyPrivateTokenContract) {
      deploy = EasyPrivateTokenContract.deploy(wallet, MINT_BALANCE, wallet.getAddress(), wallet.getAddress());
      deployOpts.skipPublicDeployment = true;
      deployOpts.skipClassRegistration = true;
      deployOpts.skipInitialization = false;
      deployOpts.skipPublicSimulation = true;
    } else {
      throw new Error(`Unsupported token contract type: ${this.config.contract}`);
    }

    const address = deploy.getInstance(deployOpts).address;
    if (await this.pxe.isContractPubliclyDeployed(address)) {
      this.log.info(`Token at ${address.toString()} already deployed`);
      return deploy.register();
    } else {
      this.log.info(`Deploying token contract at ${address.toString()}`);
      const sentTx = deploy.send(deployOpts);
      const txHash = await sentTx.getTxHash();
      this.log.info(`Sent tx with hash ${txHash.toString()}`);
      if (this.config.flushSetupTransactions) {
        this.log.verbose('Flushing transactions');
        await this.node!.flushTxs();
      }
      this.log.verbose('Waiting for token setup to settle');
      return sentTx.deployed({ timeout: this.config.txMinedWaitSeconds });
    }
  }

  /**
   * Mints private and public tokens for the sender if their balance is below the minimum.
   * @param token - Token contract.
   */
  private async mintTokens(token: TokenContract | EasyPrivateTokenContract) {
    const sender = token.wallet.getAddress();
    const isStandardToken = isStandardTokenContract(token);
    let privateBalance = 0n;
    let publicBalance = 0n;

    if (isStandardToken) {
      ({ privateBalance, publicBalance } = await getBalances(token, sender));
    } else {
      privateBalance = await getPrivateBalance(token, sender);
    }

    const calls: FunctionCall[] = [];
    if (privateBalance < MIN_BALANCE) {
      this.log.info(`Minting private tokens for ${sender.toString()}`);

      const from = sender; // we are setting from to sender here because of TODO(#9887)
      calls.push(
        isStandardToken
          ? token.methods.mint_to_private(from, sender, MINT_BALANCE).request()
          : token.methods.mint(MINT_BALANCE, sender, sender).request(),
      );
    }
    if (isStandardToken && publicBalance < MIN_BALANCE) {
      this.log.info(`Minting public tokens for ${sender.toString()}`);
      calls.push(token.methods.mint_to_public(sender, MINT_BALANCE).request());
    }
    if (calls.length === 0) {
      this.log.info(`Skipping minting as ${sender.toString()} has enough tokens`);
      return;
    }
    const sentTx = new BatchCall(token.wallet, calls).send();
    const txHash = await sentTx.getTxHash();
    this.log.info(`Sent tx with hash ${txHash.toString()}`);
    if (this.config.flushSetupTransactions) {
      this.log.verbose('Flushing transactions');
      await this.node!.flushTxs();
    }
    this.log.verbose('Waiting for token mint to settle');
    await sentTx.wait({ timeout: this.config.txMinedWaitSeconds });
  }
}
