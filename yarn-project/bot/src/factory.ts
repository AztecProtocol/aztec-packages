import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { getDeployedTestAccountsWallets, getInitialTestAccounts } from '@aztec/accounts/testing';
import {
  type AccountWallet,
  AztecAddress,
  type AztecNode,
  BatchCall,
  type DeployMethod,
  type DeployOptions,
  FeeJuicePaymentMethodWithClaim,
  L1FeeJuicePortalManager,
  type PXE,
  createLogger,
  createPXEClient,
  retryUntil,
} from '@aztec/aztec.js';
import { type FunctionCall } from '@aztec/circuit-types';
import { deriveSigningKey } from '@aztec/circuits.js/keys';
import { createEthereumChain, createL1Clients } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import { EasyPrivateTokenContract } from '@aztec/noir-contracts.js/EasyPrivateToken';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { makeTracedFetch } from '@aztec/telemetry-client';

import { type BotConfig, SupportedTokenContracts, getVersions } from './config.js';
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
    if (config.senderPrivateKey && !dependencies.node) {
      throw new Error(
        `Either a node client or node url must be provided for bridging L1 fee juice to deploy an account with private key`,
      );
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
    this.pxe = createPXEClient(config.pxeUrl!, getVersions(), makeTracedFetch([1, 2, 3], false));
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
    if (this.config.senderPrivateKey) {
      return await this.setupAccountWithPrivateKey(this.config.senderPrivateKey);
    } else {
      return await this.setupTestAccount();
    }
  }

  private async setupAccountWithPrivateKey(privateKey: Fr) {
    const salt = Fr.ONE;
    const signingKey = deriveSigningKey(privateKey);
    const account = await getSchnorrAccount(this.pxe, privateKey, signingKey, salt);
    const isInit = (await this.pxe.getContractMetadata(account.getAddress())).isContractInitialized;
    if (isInit) {
      this.log.info(`Account at ${account.getAddress().toString()} already initialized`);
      const wallet = await account.register();
      return wallet;
    } else {
      const address = account.getAddress();
      this.log.info(`Deploying account at ${address}`);

      const claim = await this.bridgeL1FeeJuice(address, 10n ** 22n);

      const paymentMethod = new FeeJuicePaymentMethodWithClaim(address, claim);
      const sentTx = account.deploy({ fee: { paymentMethod } });
      const txHash = await sentTx.getTxHash();
      this.log.info(`Sent tx with hash ${txHash.toString()}`);
      await this.tryFlushTxs();
      this.log.verbose('Waiting for account deployment to settle');
      await sentTx.wait({ timeout: this.config.txMinedWaitSeconds });
      this.log.info(`Account deployed at ${address}`);
      return account.getWallet();
    }
  }

  private async setupTestAccount() {
    let [wallet] = await getDeployedTestAccountsWallets(this.pxe);
    if (wallet) {
      this.log.info(`Using funded test account: ${wallet.getAddress()}`);
    } else {
      this.log.info('Registering funded test account');
      const [account] = await getInitialTestAccounts();
      const manager = await getSchnorrAccount(this.pxe, account.secret, account.signingKey, account.salt);
      wallet = await manager.register();
      this.log.info(`Funded test account registered: ${wallet.getAddress()}`);
    }
    return wallet;
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
      deploy = EasyPrivateTokenContract.deploy(wallet, MINT_BALANCE, wallet.getAddress());
      deployOpts.skipPublicDeployment = true;
      deployOpts.skipClassRegistration = true;
      deployOpts.skipInitialization = false;
      deployOpts.skipPublicSimulation = true;
    } else {
      throw new Error(`Unsupported token contract type: ${this.config.contract}`);
    }

    const address = (await deploy.getInstance(deployOpts)).address;
    if ((await this.pxe.getContractMetadata(address)).isContractPubliclyDeployed) {
      this.log.info(`Token at ${address.toString()} already deployed`);
      return deploy.register();
    } else {
      this.log.info(`Deploying token contract at ${address.toString()}`);
      const sentTx = deploy.send(deployOpts);
      const txHash = await sentTx.getTxHash();
      this.log.info(`Sent tx with hash ${txHash.toString()}`);
      await this.tryFlushTxs();
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
          ? await token.methods.mint_to_private(from, sender, MINT_BALANCE).request()
          : await token.methods.mint(MINT_BALANCE, sender).request(),
      );
    }
    if (isStandardToken && publicBalance < MIN_BALANCE) {
      this.log.info(`Minting public tokens for ${sender.toString()}`);
      calls.push(await token.methods.mint_to_public(sender, MINT_BALANCE).request());
    }
    if (calls.length === 0) {
      this.log.info(`Skipping minting as ${sender.toString()} has enough tokens`);
      return;
    }
    const sentTx = new BatchCall(token.wallet, calls).send();
    const txHash = await sentTx.getTxHash();
    this.log.info(`Sent tx with hash ${txHash.toString()}`);
    await this.tryFlushTxs();
    this.log.verbose('Waiting for token mint to settle');
    await sentTx.wait({ timeout: this.config.txMinedWaitSeconds });
  }

  private async bridgeL1FeeJuice(recipient: AztecAddress, amount: bigint) {
    const l1RpcUrl = this.config.l1RpcUrl;
    if (!l1RpcUrl) {
      throw new Error('L1 Rpc url is required to bridge the fee juice to fund the deployment of the account.');
    }
    const mnemonicOrPrivateKey = this.config.l1Mnemonic || this.config.l1PrivateKey;
    if (!mnemonicOrPrivateKey) {
      throw new Error(
        'Either a mnemonic or private key of an L1 account is required to bridge the fee juice to fund the deployment of the account.',
      );
    }

    const { l1ChainId } = await this.pxe.getNodeInfo();
    const chain = createEthereumChain(l1RpcUrl, l1ChainId);
    const { publicClient, walletClient } = createL1Clients(chain.rpcUrl, mnemonicOrPrivateKey, chain.chainInfo);

    const portal = await L1FeeJuicePortalManager.new(this.pxe, publicClient, walletClient, this.log);
    const claim = await portal.bridgeTokensPublic(recipient, amount, true /* mint */);
    this.log.info('Created a claim for L1 fee juice.');

    // Progress by 2 L2 blocks so that the l1ToL2Message added above will be available to use on L2.
    await this.advanceL2Block();
    await this.advanceL2Block();

    return claim;
  }

  private async advanceL2Block() {
    const initialBlockNumber = await this.node!.getBlockNumber();
    await this.tryFlushTxs();
    await retryUntil(async () => (await this.node!.getBlockNumber()) >= initialBlockNumber + 1);
  }

  private async tryFlushTxs() {
    if (this.config.flushSetupTransactions) {
      this.log.verbose('Flushing transactions');
      try {
        await this.node!.flushTxs();
      } catch (err) {
        this.log.error(`Failed to flush transactions: ${err}`);
      }
    }
  }
}
